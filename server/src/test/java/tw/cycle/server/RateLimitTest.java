package tw.cycle.server;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import tw.cycle.server.config.CycleProperties;
import tw.cycle.server.config.ProductionGuard;

/** 上線前的安全設定（#79）：不用登入的 API 依 IP 限制次數、正式環境缺設定不啟動。 */
@SpringBootTest(properties = {
    "cycle.rate-limit.register-per-hour=2",
    "cycle.rate-limit.login-per-ten-minutes=3",
    "cycle.rate-limit.events-per-minute=100",
    "cycle.rate-limit.push-per-minute=100",
})
@AutoConfigureMockMvc
class RateLimitTest {
    @Autowired MockMvc mvc;

    private MockHttpServletRequestBuilder from(MockHttpServletRequestBuilder req, String ip, String body) {
        return req.with(r -> {
            r.setRemoteAddr(ip);
            return r;
        }).contentType(MediaType.APPLICATION_JSON).content(body);
    }

    @Test
    void 同一個IP註冊太多次_回429_別的IP不受影響() throws Exception {
        for (int i = 0; i < 2; i++)
            mvc.perform(from(post("/api/auth/register"), "198.51.100.1", "{\"username\":\"rl_a" + i + "\",\"password\":\"guppy-1234\"}")).andExpect(status().isCreated());
        mvc.perform(from(post("/api/auth/register"), "198.51.100.1", "{\"username\":\"rl_a9\",\"password\":\"guppy-1234\"}"))
                .andExpect(status().isTooManyRequests()).andExpect(jsonPath("$.code").value("too_many"));
        mvc.perform(from(post("/api/auth/register"), "198.51.100.2", "{\"username\":\"rl_b0\",\"password\":\"guppy-1234\"}")).andExpect(status().isCreated());
    }

    @Test
    void 同一個IP猜很多帳號的密碼_回429() throws Exception {
        for (int i = 0; i < 3; i++)
            mvc.perform(from(post("/api/auth/login"), "198.51.100.7", "{\"username\":\"nobody" + i + "\",\"password\":\"guess-1234\"}")).andExpect(status().isUnauthorized());
        mvc.perform(from(post("/api/auth/login"), "198.51.100.7", "{\"username\":\"nobody9\",\"password\":\"guess-1234\"}")).andExpect(status().isTooManyRequests());
    }

    @Test
    void 正式環境缺設定就列出來() {
        var sim = new CycleProperties.Sim("", "", 20);
        var bad = new CycleProperties(List.of("http://localhost:5173"), 30, 1000, 3, true, null, sim, true, null);
        assertThat(new ProductionGuard(bad, "cycle", "none").problems()).hasSize(5);
        var good = new CycleProperties(List.of("https://cycle.example.com", "https://localhost", "capacitor://localhost"), 30, 1000, 3, false, null, new CycleProperties.Sim("http://sim:8091", "s3cret", 20), true, null);
        assertThat(new ProductionGuard(good, "a-long-password", "native").problems()).isEmpty();
        assertThat(new ProductionGuard(good, "a-long-password", "native").warnings()).isEmpty();
        // 沒設 FORWARD_HEADERS 不擋啟動，只提醒放在反向代理後面時頻率限制會變全站共用
        assertThat(new ProductionGuard(good, "a-long-password", "none").problems()).isEmpty();
        assertThat(new ProductionGuard(good, "a-long-password", "none").warnings()).singleElement().asString().contains("FORWARD_HEADERS");
        // App 的來源可以留，開發用的 localhost（含 127.0.0.1）不行
        var devOrigin = new CycleProperties(List.of("https://cycle.example.com", "https://localhost", "http://127.0.0.1:5173"), 30, 1000, 3, false, null, new CycleProperties.Sim("http://sim:8091", "s3cret", 20), true, null);
        assertThat(new ProductionGuard(devOrigin, "a-long-password", "native").problems()).singleElement().asString().contains("ALLOWED_ORIGINS");
        // 本機（沒設 CYCLE_PRODUCTION）不檢查
        var local = new CycleProperties(List.of("http://localhost:5173"), 30, 1000, 3, true, null, sim, false, null);
        assertThat(new ProductionGuard(local, "cycle", "none").problems()).isEmpty();
        assertThat(new ProductionGuard(local, "cycle", "none").warnings()).isEmpty();
    }
}
