// يقرأ نصوص الكتب من فهارس Lucene في المكتبة الشاملة (database/store/*) ويكتبها كما هي.
// لا يغيّر حرفًا: كل حقل مخزَّن يُكتب بقيمته الأصلية في ملف JSONL.
//
// الاستعمال:
//   java -cp "lib/*:." Extract inspect <outDir> <bookIds,> <indexDir>...
//   java -cp "lib/*:." Extract dump    <outDir> <bookIds,> <indexDir>...
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import org.apache.lucene.document.Document;
import org.apache.lucene.index.*;
import org.apache.lucene.search.*;
import org.apache.lucene.store.FSDirectory;
import org.apache.lucene.util.Bits;

public class Extract {
  static final String[] BOOK_FIELDS = {"book_id", "book", "bk", "id"};

  public static void main(String[] args) throws Exception {
    if (args.length < 4) {
      System.err.println("usage: Extract inspect|dump <outDir> <bookIds,> <indexDir>...");
      System.exit(2);
    }
    String mode = args[0];
    Path out = Paths.get(args[1]);
    Set<String> books = new HashSet<>(Arrays.asList(args[2].split(",")));
    for (int k = 3; k < args.length; k++) {
      Path idx = Paths.get(args[k]);
      String name = idx.getFileName().toString();
      try (DirectoryReader r = DirectoryReader.open(FSDirectory.open(idx))) {
        System.err.println("[index " + name + "] docs=" + r.numDocs());
        if (mode.equals("inspect")) inspect(r, name);
        else dump(r, name, books, out.resolve(name));
      } catch (Exception e) {
        System.err.println("[index " + name + "] FAILED: " + e);
      }
    }
  }

  static void inspect(DirectoryReader r, String name) throws IOException {
    for (LeafReaderContext ctx : r.leaves()) {
      for (FieldInfo fi : ctx.reader().getFieldInfos())
        System.out.println(name + " field: " + fi.name + " indexed=" + (fi.getIndexOptions() != IndexOptions.NONE));
      break;
    }
    int shown = 0;
    for (LeafReaderContext ctx : r.leaves()) {
      LeafReader lr = ctx.reader();
      Bits live = lr.getLiveDocs();
      StoredFields sf = lr.storedFields();
      for (int i = 0; i < lr.maxDoc() && shown < 3; i++) {
        if (live != null && !live.get(i)) continue;
        Document d = sf.document(i);
        StringBuilder sb = new StringBuilder(name + " doc:");
        for (IndexableField f : d.getFields()) {
          String v = val(f);
          if (v.length() > 120) v = v.substring(0, 120) + "…";
          sb.append("\n   ").append(f.name()).append(" = ").append(v.replace('\n', ' '));
        }
        System.out.println(sb);
        shown++;
      }
      if (shown >= 3) break;
    }
  }

  static String val(IndexableField f) {
    if (f.stringValue() != null) return f.stringValue();
    if (f.numericValue() != null) return f.numericValue().toString();
    if (f.binaryValue() != null) return f.binaryValue().utf8ToString();
    return "";
  }

  static String bookOf(Document d) {
    for (String n : BOOK_FIELDS) {
      String v = d.get(n);
      if (v == null) continue;
      if (n.equals("id")) {
        String[] p = v.split("[-_:]", 2);
        return p.length == 2 ? p[0] : null;
      }
      return v;
    }
    return null;
  }

  static void dump(DirectoryReader r, String name, Set<String> books, Path dir) throws IOException {
    Files.createDirectories(dir);
    Map<String, Writer> writers = new HashMap<>();
    long written = 0;
    // 1) البحث المباشر بالبادئة "رقم_الكتاب-" في الحقل id (سريع)
    IndexSearcher s = new IndexSearcher(r);
    StoredFields ssf = s.storedFields();
    for (String b : books) {
      Query q = new PrefixQuery(new Term("id", b + "-"));
      int n = s.count(q);
      if (n == 0) continue;
      TopDocs td = s.search(q, n);
      for (ScoreDoc sd : td.scoreDocs) {
        write(writers, dir, b, ssf.document(sd.doc));
        written++;
      }
    }
    // 2) إن لم يُفهرس الحقل id: مرور على كل الوثائق (أبطأ)
    if (written == 0) {
      System.err.println("[index " + name + "] prefix search found nothing; scanning all docs…");
      Set<String> keyFields = new HashSet<>(Arrays.asList(BOOK_FIELDS));
      for (LeafReaderContext ctx : r.leaves()) {
        LeafReader lr = ctx.reader();
        Bits live = lr.getLiveDocs();
        StoredFields sf = lr.storedFields();
        for (int i = 0; i < lr.maxDoc(); i++) {
          if (live != null && !live.get(i)) continue;
          String b = bookOf(sf.document(i, keyFields));
          if (b == null || !books.contains(b)) continue;
          write(writers, dir, b, sf.document(i));
          written++;
        }
      }
    }
    for (Writer w : writers.values()) w.close();
    System.err.println("[index " + name + "] wrote " + written + " docs");
  }

  static void write(Map<String, Writer> ws, Path dir, String book, Document d) throws IOException {
    Writer w = ws.get(book);
    if (w == null) {
      w = new BufferedWriter(new OutputStreamWriter(
          new FileOutputStream(dir.resolve(book + ".jsonl").toFile()), StandardCharsets.UTF_8));
      ws.put(book, w);
    }
    StringBuilder sb = new StringBuilder("{");
    boolean first = true;
    Set<String> seen = new HashSet<>();
    for (IndexableField f : d.getFields()) {
      if (!seen.add(f.name())) continue;
      if (!first) sb.append(',');
      first = false;
      sb.append(json(f.name())).append(':').append(json(val(f)));
    }
    w.write(sb.append("}\n").toString());
  }

  static String json(String s) {
    StringBuilder sb = new StringBuilder("\"");
    for (int i = 0; i < s.length(); i++) {
      char c = s.charAt(i);
      switch (c) {
        case '"': sb.append("\\\""); break;
        case '\\': sb.append("\\\\"); break;
        case '\n': sb.append("\\n"); break;
        case '\r': sb.append("\\r"); break;
        case '\t': sb.append("\\t"); break;
        default:
          if (c < 0x20) sb.append(String.format("\\u%04x", (int) c));
          else sb.append(c);
      }
    }
    return sb.append('"').toString();
  }
}
