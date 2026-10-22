package tw.cycle.server;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import tw.cycle.server.sim.HttpSimClient;
import tw.cycle.server.sim.SimClient;

/** 伺服器權威模擬（L2）：Spring Boot 這邊怎麼用模擬服務（模擬本身的測試在 src/simsvc/handlers.test.ts）。 */
@SpringBootTest
@AutoConfigureMockMvc
class SimTest {
    /** 假的模擬服務：回傳測試指定的結果，記下收到什麼。 */
    static class FakeSim implements SimClient {
        final ObjectMapper json = new ObjectMapper();
        List<Problem> problems = List.of();
        /** 沒有上一份可比（第一次上傳、強制覆蓋）時，這份自己的問題。 */
        List<Problem> aloneProblems = List.of();
        int aloneChecks;
        boolean down;
        boolean unreadable;
        final List<Long> verifiedElapsed = new ArrayList<>();
        final List<Long> advancedFrom = new ArrayList<>();
        final List<List<JsonNode>> verifiedShipped = new ArrayList<>();
        final List<List<JsonNode>> verifiedReceived = new ArrayList<>();
        final List<List<JsonNode>> verifiedUntraced = new ArrayList<>();
        Inspect inspect = new Inspect(false, false, null);
        /** 到貨查詢：照收到的訂單回答；記下每次問了哪些訂單。 */
        java.util.function.Function<ArrivalQuery, Arrival> arrival = q -> new Arrival(q.order(), "unknown", false, false);
        final List<List<ArrivalQuery>> arrivalQueries = new ArrayList<>();

        @Override
        public boolean enabled() {
            return true;
        }

        @Override
        public Advance advance(JsonNode save, long now) {
            advancedFrom.add(save.path("savedAt").asLong());
            ObjectNode out = save.deepCopy();
            out.put("savedAt", now);
            ((ObjectNode) out.path("state")).put("hours", out.path("state").path("hours").asDouble() + 7);
            return new Advance(out, 7, false, 1, 3);
        }

        @Override
        public List<Problem> verify(JsonNode previous, JsonNode next, long elapsedMs, List<JsonNode> shipped, List<JsonNode> received, List<JsonNode> untraced) {
            verifiedUntraced.add(untraced);
            if (down) throw new Unavailable("down", null);
            if (unreadable) throw new HttpSimClient.BadSave("讀不出這份存檔");
            if (previous.isNull()) {
                aloneChecks++;
                return aloneProblems;
            }
            verifiedElapsed.add(elapsedMs);
            verifiedShipped.add(shipped);
            verifiedReceived.add(received);
            // 假的：只要伺服器說有出貨的魚，就當成存檔裡又出現了
            if (!shipped.isEmpty()) return List.of(new Problem("shipped_fish", "#" + shipped.get(0).get("id") + " 已經在市場賣出了"));
            return problems;
        }

        @Override
        public Inspect inspect(JsonNode save, long fishId) {
            return inspect;
        }

        @Override
        public List<Arrival> arrivals(JsonNode save, List<ArrivalQuery> orders) {
            if (down) throw new Unavailable("down", null);
            arrivalQueries.add(orders);
            return orders.stream().map(arrival).toList();
        }
    }

    @TestConfiguration
    static class Config {
        @Bean
        @Primary
        MutableClock testClock() {
            return new MutableClock();
        }

        @Bean
        @Primary
        FakeSim fakeSim() {
            return new FakeSim();
        }

        /** 到貨不會死在路上（MarketTest.FixedRandom 的 0.99）。 */
        @Bean
        @Primary
        MarketTest.FixedRandom testRandom() {
            return new MarketTest.FixedRandom();
        }
    }

    private static final AtomicInteger SEQ = new AtomicInteger();
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired MutableClock clock;
    @Autowired FakeSim sim;

    @BeforeEach
    void reset() {
        sim.problems = List.of();
        sim.aloneProblems = List.of();
        sim.aloneChecks = 0;
        sim.down = false;
        sim.unreadable = false;
        sim.verifiedElapsed.clear();
        sim.advancedFrom.clear();
        sim.verifiedShipped.clear();
        sim.verifiedReceived.clear();
        sim.verifiedUntraced.clear();
        sim.inspect = new SimClient.Inspect(false, false, null);
        sim.arrival = q -> new SimClient.Arrival(q.order(), "unknown", false, false);
        sim.arrivalQueries.clear();
    }

    private ResultActions send(MockHttpServletRequestBuilder req, String token, String body) throws Exception {
        if (token != null) req.header("Authorization", "Bearer " + token);
        if (body != null) req.contentType(MediaType.APPLICATION_JSON).content(body);
        return mvc.perform(req);
    }

    private JsonNode read(ResultActions r) throws Exception {
        return json.readTree(r.andReturn().getResponse().getContentAsString());
    }

    private String player() throws Exception {
        String name = "sim" + SEQ.incrementAndGet();
        return read(send(post("/api/auth/register"), null, "{\"username\":\"" + name + "\",\"password\":\"guppy-1234\"}").andExpect(status().isCreated())).get("token").asText();
    }

    private static String saveBody(long base, boolean force) {
        return saveBody(base, force, 0);
    }

    /** ledgerSeq：存檔套用到帳本第幾筆（市場的錢由伺服器記帳，docs/ledger.md）。 */
    private static String saveBody(long base, boolean force, int ledgerSeq) {
        return "{\"baseRevision\":" + base + ",\"force\":" + force + ",\"save\":{\"version\":3,\"savedAt\":1000,\"timeScale\":7,\"state\":{\"hours\":12,\"economy\":{\"coins\":10000,\"ledgerSeq\":" + ledgerSeq + "}}}}";
    }

    /** 會動到錢的市場請求帶上雲端存檔的版本。 */
    private static String withRevision(String body, long revision) {
        return body.substring(0, body.length() - 1) + ",\"baseRevision\":" + revision + "}";
    }

    private static final String FISH = "{\"kind\":\"fish\",\"species\":\"guppy\",\"title\":\"孔雀魚 公\",\"price\":200,\"item\":{\"id\":7,\"species\":\"guppy\",\"sex\":\"male\",\"genome\":{\"tail\":100}}}";

    @Test
    void 上傳時跟上一份比對_時間跑太快或改了魚就擋下() throws Exception {
        String me = player();
        send(put("/api/save"), me, saveBody(0, false)).andExpect(status().isOk());
        clock.advance(Duration.ofMinutes(10));
        send(put("/api/save"), me, saveBody(1, false)).andExpect(status().isOk());
        // 伺服器用自己的時鐘算過了多久，不看遊戲端的 savedAt
        assertThat(sim.verifiedElapsed).containsExactly(Duration.ofMinutes(10).toMillis());

        sim.problems = List.of(new SimClient.Problem("time_ahead", "遊戲時間跑得比伺服器快"));
        send(put("/api/save"), me, saveBody(2, false))
                .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("time_ahead"));
        // 被擋下的那份沒有存進去
        assertThat(read(send(get("/api/save"), me, null)).get("revision").asLong()).isEqualTo(2);
    }

    @Test
    void 模擬服務檢查不了時不收存檔_要稍後再傳() throws Exception {
        // #74：以前模擬服務連不上（或存檔大到模擬服務回 413）就跳過檢查照收，等於沒檢查
        String me = player();
        send(put("/api/save"), me, saveBody(0, false)).andExpect(status().isOk());
        sim.down = true;
        send(put("/api/save"), me, saveBody(1, false))
                .andExpect(status().isServiceUnavailable()).andExpect(jsonPath("$.code").value("sim_down"));
        assertThat(read(send(get("/api/save"), me, null)).get("revision").asLong()).isEqualTo(1);

        sim.down = false;
        send(put("/api/save"), me, saveBody(1, false)).andExpect(status().isOk()).andExpect(jsonPath("$.revision").value(2));
    }

    @Test
    void 模擬服務讀不出存檔時不收() throws Exception {
        String me = player();
        send(put("/api/save"), me, saveBody(0, false)).andExpect(status().isOk());
        sim.unreadable = true;
        send(put("/api/save"), me, saveBody(1, false))
                .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("bad_save"));
        assertThat(read(send(get("/api/save"), me, null)).get("revision").asLong()).isEqualTo(1);
    }

    @Test
    void 強制覆蓋時模擬服務檢查不了_收下但暫時不能上架魚() throws Exception {
        String me = player();
        clock.advance(Duration.ofDays(3));
        send(put("/api/save"), me, saveBody(0, false)).andExpect(status().isOk());
        sim.down = true;
        JsonNode r = read(send(put("/api/save"), me, saveBody(0, true)).andExpect(status().isOk()));
        assertThat(r.get("notice").asText()).contains("不能在市場上架魚");

        sim.down = false;
        sim.inspect = new SimClient.Inspect(true, true, json.readTree("{\"id\":7,\"species\":\"guppy\",\"sex\":\"male\"}"));
        send(post("/api/market/listings"), me, FISH).andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("save_replaced"));
    }

    @Test
    void 雲端第一次上傳也檢查_改出來的魚不收_強制也不收() throws Exception {
        // #76：以前第一次上傳完全不檢查，偽造的存檔直接成為基準
        String me = player();
        sim.aloneProblems = List.of(new SimClient.Problem("genome_forged", "#9 這條魚不是店裡買得到的，也不是市場來的"));
        send(put("/api/save"), me, saveBody(0, false)).andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("genome_forged"));
        send(put("/api/save"), me, saveBody(0, true)).andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("genome_forged"));
        sim.aloneProblems = List.of();
        send(put("/api/save"), me, saveBody(0, false)).andExpect(status().isOk());
        assertThat(sim.aloneChecks).isEqualTo(3);
        assertThat(sim.verifiedElapsed).isEmpty();
    }

    @Test
    void 強制覆蓋_跟上一份對不上可以收_但這份自己有改出來的魚不收() throws Exception {
        String me = player();
        send(put("/api/save"), me, saveBody(0, false)).andExpect(status().isOk());
        sim.problems = List.of(new SimClient.Problem("identity_changed", "#7 這條魚的身分跟伺服器上的不一樣"));
        sim.aloneProblems = List.of(new SimClient.Problem("genome_forged", "#7 這條魚不是店裡買得到的，也不是市場來的"));
        send(put("/api/save"), me, saveBody(1, true)).andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("genome_forged"));
        assertThat(read(send(get("/api/save"), me, null)).get("revision").asLong()).isEqualTo(1);
        sim.aloneProblems = List.of();
        send(put("/api/save"), me, saveBody(1, true)).andExpect(status().isOk());
    }

    @Test
    void 來歷查不到的魚_存檔照收_那尾不能上架_之後的檢查會帶上牠() throws Exception {
        // #76：第一次上傳的魚媽媽不在存檔裡，基因沒辦法查；不擋存檔，但不能拿去市場賣
        String me = player();
        clock.advance(Duration.ofDays(3));
        JsonNode fake = json.readTree("{\"id\":7,\"genome\":{\"tail\":100}}");
        sim.aloneProblems = List.of(new SimClient.Problem("lineage_unknown", "#7 這條小魚的媽媽不在存檔裡，查不到來歷", fake));
        send(put("/api/save"), me, saveBody(0, false)).andExpect(status().isOk());

        sim.inspect = new SimClient.Inspect(true, true, json.readTree("{\"id\":7,\"species\":\"guppy\",\"sex\":\"male\",\"genome\":{\"tail\":100}}"));
        send(post("/api/market/listings"), me, withRevision(FISH, 1)).andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("lineage_unknown"));
        // 同編號、不同基因（新遊戲的另一條）可以上架
        sim.inspect = new SimClient.Inspect(true, true, json.readTree("{\"id\":7,\"species\":\"guppy\",\"sex\":\"male\",\"genome\":{\"tail\":60}}"));
        send(post("/api/market/listings"), me, withRevision(FISH, 1)).andExpect(status().isCreated());

        // 下次上傳把記下的帶給模擬服務（牠生的小魚也查不到）；再標一次不會重複記
        sim.problems = List.of(new SimClient.Problem("lineage_unknown", "#7 這條小魚的媽媽不在存檔裡，查不到來歷", fake));
        send(put("/api/save"), me, saveBody(2, false, 1)).andExpect(status().isOk());
        assertThat(lastUntraced()).containsExactly("7:{\"tail\":100}");
        upload(me);
        assertThat(lastUntraced()).containsExactly("7:{\"tail\":100}");
    }

    @Test
    void 伺服器補算_存成新的一版() throws Exception {
        String me = player();
        send(post("/api/save/advance"), me, null).andExpect(status().isNotFound());
        send(put("/api/save"), me, saveBody(0, false)).andExpect(status().isOk());
        clock.advance(Duration.ofMinutes(5));
        JsonNode r = read(send(post("/api/save/advance"), me, null).andExpect(status().isOk()));
        assertThat(r.get("revision").asLong()).isEqualTo(2);
        assertThat(r.get("hours").asDouble()).isEqualTo(7);
        assertThat(r.get("births").asInt()).isEqualTo(3);
        assertThat(r.get("save").get("state").get("hours").asDouble()).isEqualTo(19);
        assertThat(r.get("savedAt").asLong()).isEqualTo(clock.instant().toEpochMilli());
        assertThat(read(send(get("/api/save"), me, null)).get("save").get("state").get("hours").asDouble()).isEqualTo(19);
    }

    @Test
    void 伺服器補算_從伺服器收下存檔的時間算起_改savedAt不能快轉() throws Exception {
        String me = player();
        // 存檔裡寫 savedAt=1000（1970 年），以前補算會從那時候一路算到現在
        send(put("/api/save"), me, saveBody(0, false)).andExpect(status().isOk());
        long uploadedAt = clock.instant().toEpochMilli();
        clock.advance(Duration.ofMinutes(5));
        send(post("/api/save/advance"), me, null).andExpect(status().isOk());
        assertThat(sim.advancedFrom).containsExactly(uploadedAt);
        // 一分鐘內再叫：不補算，回雲端那份
        clock.advance(Duration.ofSeconds(30));
        JsonNode again = read(send(post("/api/save/advance"), me, null).andExpect(status().isOk()));
        assertThat(again.get("hours").asDouble()).isZero();
        assertThat(again.get("revision").asLong()).isEqualTo(2);
        assertThat(again.get("save").get("state").get("hours").asDouble()).isEqualTo(19);
        assertThat(sim.advancedFrom).hasSize(1);
        // 過了一分鐘可以再補算，起點是上一次補算存下的時間
        long advancedAt = clock.instant().minusSeconds(30).toEpochMilli();
        clock.advance(Duration.ofMinutes(1));
        send(post("/api/save/advance"), me, null).andExpect(status().isOk());
        assertThat(sim.advancedFrom).containsExactly(uploadedAt, advancedAt);
    }

    @Test
    void 上架魚_用伺服器存檔裡的那條() throws Exception {
        String me = player();
        clock.advance(Duration.ofDays(3));
        send(post("/api/market/listings"), me, FISH).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("no_cloud_save"));
        send(put("/api/save"), me, saveBody(0, false)).andExpect(status().isOk());
        send(post("/api/market/listings"), me, FISH).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("not_in_save"));

        // 遊戲端說尾鰭 100 分，伺服器那份是 60 分：上架的是伺服器那份
        JsonNode real = json.readTree("{\"id\":7,\"species\":\"guppy\",\"sex\":\"male\",\"genome\":{\"tail\":60},\"health\":1}");
        sim.inspect = new SimClient.Inspect(true, true, real);
        long id = read(send(post("/api/market/listings"), me, withRevision(FISH, 1)).andExpect(status().isCreated())).get("id").asLong();
        JsonNode listed = null;
        for (JsonNode l : read(send(get("/api/market/mine"), me, null)).get("listings")) if (l.get("id").asLong() == id) listed = l;
        assertThat(listed).isNotNull();
        // 之後更新近況也要是同一條（基因跟伺服器那份一樣）
        send(put("/api/market/listings/" + id), me, "{\"item\":{\"id\":7,\"species\":\"guppy\",\"sex\":\"male\",\"genome\":{\"tail\":100},\"health\":1}}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("not_same_fish"));
        send(put("/api/market/listings/" + id), me, "{\"item\":{\"id\":7,\"species\":\"guppy\",\"sex\":\"male\",\"genome\":{\"tail\":60},\"health\":0.9}}")
                .andExpect(status().isNoContent());

        sim.inspect = new SimClient.Inspect(true, false, real);
        send(post("/api/market/listings"), me, FISH).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("dead"));
    }

    @Test
    void 出貨後拿舊存檔把魚找回來_不收_強制覆蓋也不收() throws Exception {
        // #75：出貨後上傳出貨前的舊存檔，魚又回到賣家缸裡
        String me = player();
        String buyer = player();
        clock.advance(Duration.ofDays(3));
        send(put("/api/save"), me, saveBody(0, false)).andExpect(status().isOk());
        JsonNode real = json.readTree("{\"id\":7,\"species\":\"guppy\",\"sex\":\"male\",\"genome\":{\"tail\":60},\"health\":1}");
        sim.inspect = new SimClient.Inspect(true, true, real);
        long listing = read(send(post("/api/market/listings"), me, withRevision(FISH, 1)).andExpect(status().isCreated())).get("id").asLong();
        send(put("/api/save"), buyer, saveBody(0, false)).andExpect(status().isOk());
        long order = read(send(post("/api/market/listings/" + listing + "/buy"), buyer, "{\"packaging\":\"bag\",\"baseRevision\":1}").andExpect(status().isOk())).get("order").get("id").asLong();

        // 還沒出貨：魚還在缸裡，正常上傳（上架費讓雲端多了一版、帳本一筆）
        send(put("/api/save"), me, saveBody(2, false, 1)).andExpect(status().isOk());
        assertThat(sim.verifiedShipped.get(0)).isEmpty();

        send(post("/api/market/orders/" + order + "/ship"), me, "{\"item\":" + real + ",\"bagTemp\":25,\"bagPh\":7}").andExpect(status().isOk());
        send(put("/api/save"), me, saveBody(3, false, 1))
                .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("shipped_fish"));
        // 交給模擬服務比對的是編號＋身分（新遊戲同編號的別條魚不算，handlers.test.ts）
        JsonNode sold = sim.verifiedShipped.get(1).get(0);
        assertThat(sim.verifiedShipped.get(1)).hasSize(1);
        assertThat(sold.get("id").asLong()).isEqualTo(7);
        assertThat(sold.get("genome").get("tail").asInt()).isEqualTo(60);
        assertThat(sold.has("health")).isFalse();
        send(put("/api/save"), me, saveBody(3, true, 1))
                .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("shipped_fish"));
        assertThat(read(send(get("/api/save"), me, null)).get("revision").asLong()).isEqualTo(3);
    }

    @Test
    void 出貨時母魚肚子裡的父系基因用伺服器那份() throws Exception {
        // #75：以前遊戲端可以把母魚的父系基因改成好的，買家拿到會生出好魚的母魚
        String me = player();
        String buyer = player();
        clock.advance(Duration.ofDays(3));
        send(put("/api/save"), me, saveBody(0, false)).andExpect(status().isOk());
        JsonNode real = json.readTree("{\"id\":7,\"species\":\"guppy\",\"sex\":\"female\",\"genome\":{\"tail\":60},\"sire\":{\"genome\":{\"tail\":10},\"lineage\":3,\"inbreeding\":0},\"health\":1}");
        sim.inspect = new SimClient.Inspect(true, true, real);
        String fish = "{\"kind\":\"fish\",\"species\":\"guppy\",\"title\":\"孔雀魚 母\",\"price\":200,\"item\":{\"id\":7}}";
        long listing = read(send(post("/api/market/listings"), me, withRevision(fish, 1)).andExpect(status().isCreated())).get("id").asLong();
        send(put("/api/save"), buyer, saveBody(0, false)).andExpect(status().isOk());
        long order = read(send(post("/api/market/listings/" + listing + "/buy"), buyer, "{\"packaging\":\"bag\",\"baseRevision\":1}").andExpect(status().isOk())).get("order").get("id").asLong();

        ObjectNode forged = real.deepCopy();
        ((ObjectNode) forged.get("sire").get("genome")).put("tail", 100);
        forged.put("health", 0.9);
        send(post("/api/market/orders/" + order + "/ship"), me, "{\"item\":" + forged + ",\"bagTemp\":25,\"bagPh\":7}").andExpect(status().isOk());
        // 出貨的那份（買家到貨會拿到的）：父系基因是伺服器的，近況是遊戲端的（到貨死不死是隨機的，所以看賣家這邊）
        JsonNode shipped = read(send(get("/api/market/mine"), me, null)).get("sales").get(0).get("item");
        assertThat(shipped.get("sire").get("genome").get("tail").asInt()).isEqualTo(10);
        assertThat(shipped.get("health").asDouble()).isEqualTo(0.9);
    }

    @Test
    void 強制覆蓋一份對不上的存檔_收下但暫時不能上架魚() throws Exception {
        String me = player();
        clock.advance(Duration.ofDays(3));
        send(put("/api/save"), me, saveBody(0, false)).andExpect(status().isOk());
        sim.problems = List.of(new SimClient.Problem("identity_changed", "#7 這條魚的身分跟伺服器上的不一樣"));
        JsonNode r = read(send(put("/api/save"), me, saveBody(0, true)).andExpect(status().isOk()));
        assertThat(r.get("notice").asText()).contains("不能在市場上架魚");

        sim.inspect = new SimClient.Inspect(true, true, json.readTree("{\"id\":7,\"species\":\"guppy\",\"sex\":\"male\"}"));
        send(post("/api/market/listings"), me, FISH).andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("save_replaced"));
        clock.advance(Duration.ofDays(3).plusMinutes(1));
        send(post("/api/market/listings"), me, withRevision(FISH, 2)).andExpect(status().isCreated());
    }

    @Test
    void 市場扣款後伺服器補算_扣款留著_補算起點不變() throws Exception {
        // docs/ledger.md §3.3、§3.6：帳本改存檔不動 updated_at，補算從伺服器收下存檔的時間算；補算也不會把扣款蓋掉
        String me = player();
        clock.advance(Duration.ofDays(3));
        send(put("/api/save"), me, saveBody(0, false)).andExpect(status().isOk());
        long uploadedAt = clock.instant().toEpochMilli();
        sim.inspect = new SimClient.Inspect(true, true, json.readTree("{\"id\":7,\"species\":\"guppy\",\"sex\":\"male\",\"genome\":{\"tail\":60},\"health\":1}"));
        clock.advance(Duration.ofMinutes(5));
        send(post("/api/market/listings"), me, withRevision(FISH, 1)).andExpect(status().isCreated());
        clock.advance(Duration.ofMinutes(5));
        JsonNode r = read(send(post("/api/save/advance"), me, null).andExpect(status().isOk()));
        assertThat(sim.advancedFrom).containsExactly(uploadedAt);
        assertThat(r.get("revision").asLong()).isEqualTo(3);
        JsonNode economy = r.get("save").get("state").get("economy");
        assertThat(economy.get("coins").asInt()).isEqualTo(9_998);
        assertThat(economy.get("ledgerSeq").asInt()).isEqualTo(1);
    }

    /** 最近一次存檔檢查帶給模擬服務的來歷查不到的魚（編號:基因）。 */
    private List<String> lastUntraced() {
        return sim.verifiedUntraced.get(sim.verifiedUntraced.size() - 1).stream().map(f -> f.get("id").asLong() + ":" + f.get("genome")).toList();
    }

    /** 照雲端那份的版本和帳本筆數上傳一次（魚、錢都沒變）。 */
    private void upload(String token) throws Exception {
        JsonNode cloud = read(send(get("/api/save"), token, null));
        int seq = cloud.get("save").get("state").get("economy").path("ledgerSeq").asInt(0);
        send(put("/api/save"), token, saveBody(cloud.get("revision").asLong(), false, seq)).andExpect(status().isOk());
    }

    /** 賣家上架一條魚、買家買下、賣家出貨、到貨後買家收貨；回傳訂單編號。 */
    private long delivered(String seller, String buyer, long fishId) throws Exception {
        JsonNode real = json.readTree("{\"id\":" + fishId + ",\"species\":\"guppy\",\"sex\":\"male\",\"genome\":{\"tail\":60},\"health\":1}");
        sim.inspect = new SimClient.Inspect(true, true, real);
        long sellerRev = read(send(get("/api/save"), seller, null)).get("revision").asLong();
        String fish = "{\"kind\":\"fish\",\"species\":\"guppy\",\"title\":\"孔雀魚 公\",\"price\":200,\"item\":{\"id\":" + fishId + "}}";
        long listing = read(send(post("/api/market/listings"), seller, withRevision(fish, sellerRev)).andExpect(status().isCreated())).get("id").asLong();
        long buyerRev = read(send(get("/api/save"), buyer, null)).get("revision").asLong();
        long order = read(send(post("/api/market/listings/" + listing + "/buy"), buyer, "{\"packaging\":\"box\",\"baseRevision\":" + buyerRev + "}").andExpect(status().isOk())).get("order").get("id").asLong();
        send(post("/api/market/orders/" + order + "/ship"), seller, "{\"item\":" + real + ",\"bagTemp\":25,\"bagPh\":7}").andExpect(status().isOk());
        clock.advance(Duration.ofHours(6));
        send(post("/api/market/orders/" + order + "/collect"), buyer, null).andExpect(status().isOk());
        return order;
    }

    /** 賣家再上架一條魚（買家看得到賣家信譽的地方）；回傳上架編號。 */
    private long listed(String seller, long fishId) throws Exception {
        sim.inspect = new SimClient.Inspect(true, true, json.readTree("{\"id\":" + fishId + ",\"species\":\"guppy\",\"sex\":\"male\",\"health\":1}"));
        long rev = read(send(get("/api/save"), seller, null)).get("revision").asLong();
        String fish = "{\"kind\":\"fish\",\"species\":\"guppy\",\"title\":\"孔雀魚 公\",\"price\":200,\"item\":{\"id\":" + fishId + "}}";
        return read(send(post("/api/market/listings"), seller, withRevision(fish, rev)).andExpect(status().isCreated())).get("id").asLong();
    }

    /** 從買家那邊看這件上架的賣家信譽。 */
    private JsonNode sellerOf(String viewer, long listing) throws Exception {
        for (JsonNode l : read(send(get("/api/market/listings?species=guppy"), viewer, null)))
            if (l.get("id").asLong() == listing) return l.get("seller");
        throw new AssertionError("看不到賣家的上架");
    }

    @Test
    void 到貨存活追蹤_買家上傳存檔時查_活過30天才算存活_查不到不算() throws Exception {
        String me = player();
        String buyer = player();
        clock.advance(Duration.ofDays(3));
        send(put("/api/save"), me, saveBody(0, false)).andExpect(status().isOk());
        send(put("/api/save"), buyer, saveBody(0, false)).andExpect(status().isOk());
        long order = delivered(me, buyer, 7);

        // 買家存檔裡查不到這條魚：不算存活，下次再查
        upload(buyer);
        assertThat(sim.arrivalQueries).hasSize(1);
        SimClient.ArrivalQuery asked = sim.arrivalQueries.get(0).get(0);
        assertThat(asked.order()).isEqualTo(order);
        // 帶不帶病看伺服器出貨的那份
        assertThat(asked.item().get("genome").get("tail").asInt()).isEqualTo(60);
        // 還活著、還沒滿 30 天：也還不算
        sim.arrival = q -> new SimClient.Arrival(q.order(), "alive", false, false);
        clock.advance(Duration.ofMinutes(5));
        upload(buyer);
        long shown = listed(me, 8);
        assertThat(sellerOf(buyer, shown).get("survival").isNull()).isTrue();
        // 活過 30 天
        sim.arrival = q -> new SimClient.Arrival(q.order(), "alive", true, false);
        clock.advance(Duration.ofMinutes(5));
        upload(buyer);
        JsonNode seen = sellerOf(buyer, shown);
        assertThat(seen.get("survival").asDouble()).isEqualTo(1.0);
        assertThat(seen.get("sick").asBoolean()).isFalse();
        // 有結果了就不再查
        clock.advance(Duration.ofMinutes(5));
        upload(buyer);
        assertThat(sim.arrivalQueries).hasSize(3);
    }

    @Test
    void 到貨存活追蹤_死於出貨時帶的病算賣家的_買家自己養死的不算_查不了不擋上傳() throws Exception {
        String me = player();
        String buyer = player();
        clock.advance(Duration.ofDays(3));
        send(put("/api/save"), me, saveBody(0, false)).andExpect(status().isOk());
        send(put("/api/save"), buyer, saveBody(0, false)).andExpect(status().isOk());
        long sick = delivered(me, buyer, 7);
        delivered(me, buyer, 8);

        // 查到貨的時候模擬服務掛了：上傳照收，下次再查
        sim.arrival = q -> {
            throw new SimClient.Unavailable("down", null);
        };
        upload(buyer);

        sim.arrival = q -> new SimClient.Arrival(q.order(), "died", false, q.order() == sick);
        clock.advance(Duration.ofMinutes(5));
        upload(buyer);
        JsonNode seen = sellerOf(buyer, listed(me, 9));
        // 買家自己養死的那筆不算：1 筆有結果、0 筆存活
        assertThat(seen.get("survival").asDouble()).isEqualTo(0.0);
        assertThat(seen.get("sick").asBoolean()).isFalse();
    }

    @Test
    void 上傳檢查時帶上市場買到的魚的基因_新出現的魚是這些就不是改出來的() throws Exception {
        String me = player();
        String buyer = player();
        clock.advance(Duration.ofDays(3));
        send(put("/api/save"), me, saveBody(0, false)).andExpect(status().isOk());
        send(put("/api/save"), buyer, saveBody(0, false)).andExpect(status().isOk());
        delivered(me, buyer, 7);
        clock.advance(Duration.ofMinutes(5));
        upload(buyer);
        List<JsonNode> received = sim.verifiedReceived.get(sim.verifiedReceived.size() - 1);
        assertThat(received).hasSize(1);
        assertThat(received.get(0).get("tail").asInt()).isEqualTo(60);
    }

    @Test
    void 到貨存活追蹤_查的時候出了別的錯_存檔照樣收下_下次再查() throws Exception {
        String me = player();
        String buyer = player();
        clock.advance(Duration.ofDays(3));
        send(put("/api/save"), me, saveBody(0, false)).andExpect(status().isOk());
        send(put("/api/save"), buyer, saveBody(0, false)).andExpect(status().isOk());
        delivered(me, buyer, 7);
        long before = read(send(get("/api/save"), buyer, null)).get("revision").asLong();
        sim.arrival = q -> {
            throw new IllegalStateException("boom");
        };
        upload(buyer);
        // 存檔已經收下（新的一版），到貨查詢下次再來
        assertThat(read(send(get("/api/save"), buyer, null)).get("revision").asLong()).isEqualTo(before + 1);
        sim.arrival = q -> new SimClient.Arrival(q.order(), "alive", true, false);
        clock.advance(Duration.ofMinutes(5));
        upload(buyer);
        assertThat(sellerOf(buyer, listed(me, 8)).get("survival").asDouble()).isEqualTo(1.0);
    }
}
