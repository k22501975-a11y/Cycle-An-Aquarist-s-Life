package tw.cycle.server;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
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
class MallTest {
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

    private ResultActions send(MockHttpServletRequestBuilder req, String token, String body) throws Exception {
        if (token != null) req.header("Authorization", "Bearer " + token);
        if (body != null) req.contentType(MediaType.APPLICATION_JSON).content(body);
        return mvc.perform(req);
    }

    private JsonNode read(ResultActions r) throws Exception {
        return json.readTree(r.andReturn().getResponse().getContentAsString());
    }

    private String player() throws Exception {
        String name = "mall" + SEQ.incrementAndGet();
        return read(send(post("/api/auth/register"), null, "{\"username\":\"" + name + "\",\"password\":\"guppy-1234\"}").andExpect(status().isCreated())).get("token").asText();
    }

    @Test
    void 儲值入帳_買道具扣點_點數不夠不能買() throws Exception {
        String me = player();
        send(get("/api/points"), me, null).andExpect(status().isOk()).andExpect(jsonPath("$.balance").value(0)).andExpect(jsonPath("$.sandbox").value(true))
                .andExpect(jsonPath("$.packs[1].points").value(155)).andExpect(jsonPath("$.items[0].id").value("cure"));
        send(post("/api/points/buy"), me, "{\"item\":\"cure\"}").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("not_enough"));
        send(post("/api/points/topup"), me, "{\"pack\":\"p150\"}").andExpect(status().isOk()).andExpect(jsonPath("$.balance").value(155));
        send(post("/api/points/topup"), me, "{\"pack\":\"nope\"}").andExpect(status().isBadRequest());
        JsonNode bought = read(send(post("/api/points/buy"), me, "{\"item\":\"cure\"}").andExpect(status().isOk()));
        assertThat(bought.get("balance").asInt()).isEqualTo(125);
        assertThat(bought.get("grant").get("item").asText()).isEqualTo("cure");
        send(post("/api/points/buy"), me, "{\"item\":\"tankset\"}").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("not_enough"));
        send(get("/api/points/history"), me, null).andExpect(jsonPath("$[0].delta").value(-30)).andExpect(jsonPath("$[1].delta").value(155));
    }

    @Test
    void 每日限購_隔天重置() throws Exception {
        String me = player();
        send(post("/api/points/topup"), me, "{\"pack\":\"p300\"}").andExpect(status().isOk());
        for (int i = 0; i < 3; i++) send(post("/api/points/buy"), me, "{\"item\":\"cure\"}").andExpect(status().isOk());
        send(post("/api/points/buy"), me, "{\"item\":\"cure\"}").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("daily_limit"));
        send(get("/api/points"), me, null).andExpect(jsonPath("$.items[0].boughtToday").value(3)).andExpect(jsonPath("$.balance").value(230));
        clock.advance(Duration.ofDays(1));
        send(post("/api/points/buy"), me, "{\"item\":\"cure\"}").andExpect(status().isOk());
    }

    private ResultActions use(String token, String item, String requestId) throws Exception {
        return send(post("/api/points/use"), token, "{\"item\":\"" + item + "\",\"requestId\":\"" + requestId + "\"}");
    }

    @Test
    void 道具放在伺服器庫存_用一個扣一個_重送不會扣兩個() throws Exception {
        String me = player();
        String other = player();
        send(post("/api/points/topup"), me, "{\"pack\":\"p300\"}").andExpect(status().isOk());
        send(post("/api/points/buy"), me, "{\"item\":\"cure\"}").andExpect(status().isOk()).andExpect(jsonPath("$.bag.cure").value(1));
        send(post("/api/points/buy"), me, "{\"item\":\"cure\"}").andExpect(status().isOk()).andExpect(jsonPath("$.bag.cure").value(2));
        send(get("/api/points"), me, null).andExpect(jsonPath("$.bag.cure").value(2)).andExpect(jsonPath("$.bag.tankset").value(0));

        String first = java.util.UUID.randomUUID().toString();
        use(me, "cure", first).andExpect(status().isOk()).andExpect(jsonPath("$.remaining").value(1));
        // 網路斷了重送同一個請求：回上次的結果，不會再扣
        use(me, "cure", first).andExpect(status().isOk()).andExpect(jsonPath("$.remaining").value(1));
        // 同一個編號拿去用別的道具不行
        use(me, "tankset", first).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("request_reused"));
        use(me, "cure", java.util.UUID.randomUUID().toString()).andExpect(status().isOk()).andExpect(jsonPath("$.remaining").value(0));
        use(me, "cure", java.util.UUID.randomUUID().toString()).andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("no_item"));
        use(me, "tankset", java.util.UUID.randomUUID().toString()).andExpect(status().isUnprocessableEntity());
        use(me, "nope", java.util.UUID.randomUUID().toString()).andExpect(status().isBadRequest());
        // 別人的庫存是分開的；別人拿同一個編號也不會拿到我的結果
        use(other, "cure", first).andExpect(status().isUnprocessableEntity());

        send(get("/api/points"), me, null).andExpect(jsonPath("$.bag.cure").value(0));
        send(get("/api/me/export"), me, null).andExpect(jsonPath("$.points").value(260)).andExpect(jsonPath("$.mallUses.length()").value(2))
                .andExpect(jsonPath("$.payments[0].amount_twd").value(300));
    }

    @Test
    void 每月儲值上限() throws Exception {
        String me = player();
        send(post("/api/points/topup"), me, "{\"pack\":\"p1990\"}").andExpect(status().isOk());
        send(post("/api/points/topup"), me, "{\"pack\":\"p1990\"}").andExpect(status().isOk());
        send(post("/api/points/topup"), me, "{\"pack\":\"p1990\"}").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("monthly_limit"));
        send(post("/api/points/topup"), me, "{\"pack\":\"p990\"}").andExpect(status().isOk());
        send(get("/api/points"), me, null).andExpect(jsonPath("$.toppedUpThisMonth").value(4970));
    }

    @Test
    void 要登入() throws Exception {
        send(get("/api/points"), null, null).andExpect(status().isUnauthorized());
    }
}
