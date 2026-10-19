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
        boolean down;
        boolean unreadable;
        final List<Long> verifiedElapsed = new ArrayList<>();
        final List<List<Long>> verifiedShipped = new ArrayList<>();
        Inspect inspect = new Inspect(false, false, null);

        @Override
        public boolean enabled() {
            return true;
        }

        @Override
        public Advance advance(JsonNode save, long now) {
            ObjectNode out = save.deepCopy();
            out.put("savedAt", now);
            ((ObjectNode) out.path("state")).put("hours", out.path("state").path("hours").asDouble() + 7);
            return new Advance(out, 7, false, 1, 3);
        }

        @Override
        public List<Problem> verify(JsonNode previous, JsonNode next, long elapsedMs, List<Long> shipped) {
            if (down) throw new Unavailable("down", null);
            if (unreadable) throw new HttpSimClient.BadSave("讀不出這份存檔");
            verifiedElapsed.add(elapsedMs);
            verifiedShipped.add(shipped);
            // 假的：只要伺服器說有出貨的魚，就當成存檔裡又出現了
            if (!shipped.isEmpty()) return List.of(new Problem("shipped_fish", "#" + shipped.get(0) + " 已經在市場賣出了"));
            return problems;
        }

        @Override
        public Inspect inspect(JsonNode save, long fishId) {
            return inspect;
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
    }

    private static final AtomicInteger SEQ = new AtomicInteger();
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired MutableClock clock;
    @Autowired FakeSim sim;

    @BeforeEach
    void reset() {
        sim.problems = List.of();
        sim.down = false;
        sim.unreadable = false;
        sim.verifiedElapsed.clear();
        sim.verifiedShipped.clear();
        sim.inspect = new SimClient.Inspect(false, false, null);
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
        return "{\"baseRevision\":" + base + ",\"force\":" + force + ",\"save\":{\"version\":3,\"savedAt\":1000,\"timeScale\":7,\"state\":{\"hours\":12}}}";
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
    void 伺服器補算_存成新的一版() throws Exception {
        String me = player();
        send(post("/api/save/advance"), me, null).andExpect(status().isNotFound());
        send(put("/api/save"), me, saveBody(0, false)).andExpect(status().isOk());
        JsonNode r = read(send(post("/api/save/advance"), me, null).andExpect(status().isOk()));
        assertThat(r.get("revision").asLong()).isEqualTo(2);
        assertThat(r.get("hours").asDouble()).isEqualTo(7);
        assertThat(r.get("births").asInt()).isEqualTo(3);
        assertThat(r.get("save").get("state").get("hours").asDouble()).isEqualTo(19);
        assertThat(r.get("savedAt").asLong()).isEqualTo(clock.instant().toEpochMilli());
        assertThat(read(send(get("/api/save"), me, null)).get("save").get("state").get("hours").asDouble()).isEqualTo(19);
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
        long id = read(send(post("/api/market/listings"), me, FISH).andExpect(status().isCreated())).get("id").asLong();
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
        long listing = read(send(post("/api/market/listings"), me, FISH).andExpect(status().isCreated())).get("id").asLong();
        long order = read(send(post("/api/market/listings/" + listing + "/buy"), buyer, "{\"packaging\":\"bag\"}").andExpect(status().isOk())).get("id").asLong();

        // 還沒出貨：魚還在缸裡，正常上傳
        send(put("/api/save"), me, saveBody(1, false)).andExpect(status().isOk());
        assertThat(sim.verifiedShipped.get(0)).isEmpty();

        send(post("/api/market/orders/" + order + "/ship"), me, "{\"item\":" + real + ",\"bagTemp\":25,\"bagPh\":7}").andExpect(status().isOk());
        send(put("/api/save"), me, saveBody(2, false))
                .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("shipped_fish"));
        assertThat(sim.verifiedShipped.get(1)).containsExactly(7L);
        send(put("/api/save"), me, saveBody(2, true))
                .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("shipped_fish"));
        assertThat(read(send(get("/api/save"), me, null)).get("revision").asLong()).isEqualTo(2);
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
        send(post("/api/market/listings"), me, FISH).andExpect(status().isCreated());
    }
}
