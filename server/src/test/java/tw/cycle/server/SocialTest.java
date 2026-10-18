package tw.cycle.server;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicInteger;
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

@SpringBootTest
@AutoConfigureMockMvc
class SocialTest {
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

    private String code(Player p) throws Exception {
        return read(send(get("/api/friends"), p, null).andExpect(status().isOk())).get("code").asText();
    }

    private void befriend(Player a, Player b) throws Exception {
        send(post("/api/friends/request"), a, "{\"code\":\"" + code(b) + "\"}").andExpect(jsonPath("$.status").value("requested"));
        send(post("/api/friends/" + a.name() + "/accept"), b, null).andExpect(status().isNoContent());
    }

    private String cuttings(String to, int n) {
        return "{\"to\":\"" + to + "\",\"kind\":\"cuttings\",\"payload\":{\"species\":\"rotala\",\"count\":" + n + "}}";
    }

    @Test
    void 用好友碼加好友_對方接受後兩邊都看得到() throws Exception {
        Player a = player("amy");
        Player b = player("ben");
        String codeB = code(b);
        assertThat(codeB).hasSize(8).doesNotContain("0", "O", "1", "I");
        assertThat(code(b)).isEqualTo(codeB);
        send(post("/api/friends/request"), a, "{\"code\":\"" + codeB.toLowerCase() + "\"}").andExpect(jsonPath("$.username").value(b.name()));
        send(get("/api/friends"), b, null).andExpect(jsonPath("$.incoming[0]").value(a.name()));
        send(get("/api/friends"), a, null).andExpect(jsonPath("$.outgoing[0]").value(b.name()));
        send(post("/api/friends/" + a.name() + "/accept"), b, null).andExpect(status().isNoContent());
        send(get("/api/friends"), a, null).andExpect(jsonPath("$.friends[0].username").value(b.name())).andExpect(jsonPath("$.friends[0].level").value(1));
        send(get("/api/friends"), b, null).andExpect(jsonPath("$.friends[0].username").value(a.name())).andExpect(jsonPath("$.incoming").isEmpty());
    }

    @Test
    void 互相邀請直接成為好友_自己的碼和錯的碼不行() throws Exception {
        Player a = player("cat");
        Player b = player("dan");
        send(post("/api/friends/request"), a, "{\"code\":\"" + code(b) + "\"}");
        send(post("/api/friends/request"), b, "{\"code\":\"" + code(a) + "\"}").andExpect(jsonPath("$.status").value("friends"));
        send(post("/api/friends/request"), a, "{\"code\":\"" + code(a) + "\"}").andExpect(status().isBadRequest());
        send(post("/api/friends/request"), a, "{\"code\":\"ZZZZZZZZ\"}").andExpect(status().isNotFound());
    }

    @Test
    void 參觀好友的缸看得到他的存檔_每天第一次參觀加交情_非好友不能看() throws Exception {
        Player a = player("eve");
        Player b = player("fay");
        Player stranger = player("gus");
        send(put("/api/save"), b, "{\"baseRevision\":0,\"save\":{\"version\":3,\"savedAt\":99,\"timeScale\":7,\"state\":{\"hours\":5}}}").andExpect(status().isOk());
        befriend(a, b);
        send(get("/api/friends/" + b.name() + "/tank"), a, null).andExpect(status().isOk()).andExpect(jsonPath("$.save.state.hours").value(5)).andExpect(jsonPath("$.savedAt").value(99));
        send(get("/api/friends/" + b.name() + "/tank"), a, null);
        send(get("/api/friends"), a, null).andExpect(jsonPath("$.friends[0].affinity").value(1)).andExpect(jsonPath("$.friends[0].visitedToday").value(true));
        send(get("/api/friends"), b, null).andExpect(jsonPath("$.friends[0].affinity").value(1));
        send(get("/api/friends/" + b.name() + "/tank"), stranger, null).andExpect(status().isForbidden());
        clock.advance(Duration.ofDays(1));
        send(get("/api/friends/" + b.name() + "/tank"), a, null);
        send(get("/api/friends"), a, null).andExpect(jsonPath("$.friends[0].affinity").value(2));
    }

    @Test
    void 按讚每天一次() throws Exception {
        Player a = player("hal");
        Player b = player("ivy");
        befriend(a, b);
        send(post("/api/friends/" + b.name() + "/like"), a, null).andExpect(jsonPath("$.likes").value(1));
        send(post("/api/friends/" + b.name() + "/like"), a, null).andExpect(status().isConflict());
        send(get("/api/friends"), b, null).andExpect(jsonPath("$.likes").value(1));
    }

    @Test
    void 送插枝_收禮_每日額度_隔天恢復() throws Exception {
        Player a = player("jay");
        Player b = player("kim");
        befriend(a, b);
        send(post("/api/gifts"), a, cuttings(b.name(), 10)).andExpect(status().isOk()).andExpect(jsonPath("$.sendLeft").value(10));
        send(post("/api/gifts"), a, cuttings(b.name(), 10)).andExpect(status().isOk());
        send(post("/api/gifts"), a, cuttings(b.name(), 1)).andExpect(status().isTooManyRequests()).andExpect(jsonPath("$.code").value("send_limit"));
        JsonNode inbox = read(send(get("/api/gifts"), b, null));
        assertThat(inbox).hasSize(2);
        assertThat(inbox.get(0).get("payload").get("species").asText()).isEqualTo("rotala");
        long id = inbox.get(0).get("id").asLong();
        send(post("/api/gifts/" + id + "/claim"), b, null).andExpect(status().isOk()).andExpect(jsonPath("$.payload.count").value(10));
        send(post("/api/gifts/" + id + "/claim"), b, null).andExpect(status().isNotFound());
        assertThat(read(send(get("/api/gifts"), b, null))).hasSize(1);
        clock.advance(Duration.ofDays(1));
        send(post("/api/gifts"), a, cuttings(b.name(), 1)).andExpect(status().isOk());
    }

    @Test
    void 收禮也有上限_不能送給非好友_格式不對不收() throws Exception {
        Player target = player("lee");
        Player x = player("max");
        Player y = player("ned");
        Player stranger = player("oz");
        befriend(x, target);
        befriend(y, target);
        send(post("/api/gifts"), x, cuttings(target.name(), 10)).andExpect(status().isOk());
        send(post("/api/gifts"), x, cuttings(target.name(), 10)).andExpect(status().isOk());
        send(post("/api/gifts"), y, "{\"to\":\"" + target.name() + "\",\"kind\":\"media\",\"payload\":{\"bacteria\":0.5}}")
                .andExpect(status().isTooManyRequests()).andExpect(jsonPath("$.code").value("receive_limit"));
        send(post("/api/gifts"), stranger, cuttings(target.name(), 1)).andExpect(status().isForbidden());
        send(post("/api/gifts"), y, cuttings(target.name(), 11)).andExpect(status().isBadRequest());
        send(post("/api/gifts"), y, "{\"to\":\"" + target.name() + "\",\"kind\":\"rare_fish\",\"payload\":{}}").andExpect(status().isBadRequest());
    }

    @Test
    void 交情每天最多加三點() throws Exception {
        Player a = player("pam");
        Player b = player("quin");
        befriend(a, b);
        send(get("/api/friends/" + b.name() + "/tank"), a, null);
        send(post("/api/friends/" + b.name() + "/like"), a, null);
        send(post("/api/gifts"), a, cuttings(b.name(), 1));
        send(post("/api/gifts"), a, cuttings(b.name(), 1));
        send(post("/api/friends/" + a.name() + "/like"), b, null);
        send(get("/api/friends"), a, null).andExpect(jsonPath("$.friends[0].affinity").value(3));
    }

    @Test
    void 刪好友() throws Exception {
        Player a = player("ray");
        Player b = player("sue");
        befriend(a, b);
        send(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete("/api/friends/" + b.name()), a, null).andExpect(status().isNoContent());
        send(get("/api/friends"), b, null).andExpect(jsonPath("$.friends").isEmpty());
    }
}
