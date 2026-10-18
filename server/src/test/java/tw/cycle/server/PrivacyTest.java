package tw.cycle.server;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import tw.cycle.server.privacy.AnalyticsService;

@SpringBootTest
@AutoConfigureMockMvc
class PrivacyTest {
    @TestConfiguration
    static class Clocks {
        @Bean
        @Primary
        MutableClock testClock() {
            return new MutableClock();
        }
    }

    private static final AtomicInteger SEQ = new AtomicInteger();
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired MutableClock clock;
    @Autowired JdbcTemplate db;
    @Autowired AnalyticsService analytics;

    record Player(String name, String token) {}

    private ResultActions send(MockHttpServletRequestBuilder req, Player p, String body) throws Exception {
        if (p != null) req.header("Authorization", "Bearer " + p.token());
        if (body != null) req.contentType(MediaType.APPLICATION_JSON).content(body);
        return mvc.perform(req);
    }

    private JsonNode read(ResultActions r) throws Exception {
        return json.readTree(r.andReturn().getResponse().getContentAsString());
    }

    private Player player(String prefix) throws Exception {
        String name = prefix + SEQ.incrementAndGet();
        JsonNode res = read(send(post("/api/auth/register"), null, "{\"username\":\"" + name + "\",\"password\":\"guppy-1234\"}").andExpect(status().isCreated()));
        return new Player(name, res.get("token").asText());
    }

    private void befriend(Player a, Player b) throws Exception {
        String code = read(send(get("/api/friends"), b, null)).get("code").asText();
        send(post("/api/friends/request"), a, "{\"code\":\"" + code + "\"}").andExpect(status().isOk());
        send(post("/api/friends/" + a.name() + "/accept"), b, null).andExpect(status().isNoContent());
    }

    private static String events(String client, String... names) {
        StringBuilder sb = new StringBuilder("{\"clientId\":\"" + client + "\",\"events\":[");
        for (int i = 0; i < names.length; i++) sb.append(i > 0 ? "," : "").append("{\"name\":\"").append(names[i]).append("\",\"props\":{\"n\":").append(i).append("}}");
        return sb.append("]}").toString();
    }

    @Test
    void 匯出自己的資料_含雲端存檔和好友_沒登入不行() throws Exception {
        Player a = player("exp");
        Player b = player("exf");
        befriend(a, b);
        send(put("/api/save"), a, "{\"baseRevision\":0,\"force\":false,\"save\":{\"version\":3,\"savedAt\":1,\"timeScale\":7,\"state\":{\"hours\":5}}}").andExpect(status().isOk());
        JsonNode out = read(send(get("/api/me/export"), a, null).andExpect(status().isOk()));
        assertThat(out.at("/account/username").asText()).isEqualTo(a.name());
        assertThat(out.at("/cloudSave/revision").asInt()).isEqualTo(1);
        assertThat(out.at("/cloudSave/data").asText()).contains("\"hours\":5");
        assertThat(out.at("/friends/0/username").asText()).isEqualTo(b.name());
        assertThat(out.toString()).doesNotContain("password");
        send(get("/api/me/export"), null, null).andExpect(status().isUnauthorized());
    }

    @Test
    void 刪除帳號要密碼_刪掉後登入失效_好友名單也消失_名字可以重新註冊() throws Exception {
        Player a = player("del");
        Player b = player("def");
        befriend(a, b);
        send(delete("/api/account"), a, "{\"password\":\"wrong-pass\"}").andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("bad_password"));
        send(get("/api/me"), a, null).andExpect(status().isOk());
        send(delete("/api/account"), a, "{\"password\":\"guppy-1234\"}").andExpect(status().isNoContent());
        send(get("/api/me"), a, null).andExpect(status().isUnauthorized());
        send(get("/api/friends"), b, null).andExpect(jsonPath("$.friends").isEmpty());
        send(post("/api/auth/register"), null, "{\"username\":\"" + a.name() + "\",\"password\":\"guppy-5678\"}").andExpect(status().isCreated());
    }

    @Test
    void 匿名事件不用登入_格式不對的略過_每天有上限_180天後清掉() throws Exception {
        String client = UUID.randomUUID().toString();
        send(post("/api/events"), null, events(client, "session_start", "Bad Name", "fish_died")).andExpect(status().isOk()).andExpect(jsonPath("$.accepted").value(2));
        assertThat(db.queryForObject("SELECT props FROM analytics_event WHERE client_id = ? AND name = 'fish_died'", String.class, client)).isEqualTo("{\"n\":2}");
        send(post("/api/events"), null, events("not-a-uuid", "session_start")).andExpect(status().isBadRequest());
        String[] fifty = new String[50];
        java.util.Arrays.fill(fifty, "tick");
        String[] fiftyOne = new String[51];
        java.util.Arrays.fill(fiftyOne, "tick");
        send(post("/api/events"), null, events(client, fiftyOne)).andExpect(status().isBadRequest());
        int total = 2;
        for (int i = 0; i < 10; i++) total += read(send(post("/api/events"), null, events(client, fifty))).get("accepted").asInt();
        assertThat(total).isEqualTo(500);
        clock.advance(Duration.ofDays(1));
        send(post("/api/events"), null, events(client, "session_start")).andExpect(jsonPath("$.accepted").value(1));
        clock.advance(Duration.ofDays(180));
        assertThat(analytics.purge()).isEqualTo(500);
        assertThat(db.queryForObject("SELECT COUNT(*) FROM analytics_event WHERE client_id = ?", Integer.class, client)).isEqualTo(1);
    }
}
