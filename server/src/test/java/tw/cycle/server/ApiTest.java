package tw.cycle.server;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

@SpringBootTest
@AutoConfigureMockMvc
class ApiTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;

    private ResultActions send(org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder req, String token, String body) throws Exception {
        if (token != null) req.header("Authorization", "Bearer " + token);
        if (body != null) req.contentType(MediaType.APPLICATION_JSON).content(body);
        return mvc.perform(req);
    }

    private String register(String name) throws Exception {
        String res = send(post("/api/auth/register"), null, "{\"username\":\"" + name + "\",\"password\":\"guppy-1234\"}")
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return json.readTree(res).get("token").asText();
    }

    private static String saveBody(long base, long savedAt, boolean force) {
        return "{\"baseRevision\":" + base + ",\"force\":" + force + ",\"save\":{\"version\":3,\"savedAt\":" + savedAt + ",\"timeScale\":7,\"state\":{\"hours\":12}}}";
    }

    @Test
    void 註冊後可以登入_名字不分大小寫_重複的名字不行() throws Exception {
        register("Aquarist");
        send(post("/api/auth/register"), null, "{\"username\":\"aquarist\",\"password\":\"guppy-1234\"}")
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("taken"));
        send(post("/api/auth/login"), null, "{\"username\":\"AQUARIST\",\"password\":\"guppy-1234\"}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.username").value("Aquarist"));
        send(post("/api/auth/login"), null, "{\"username\":\"aquarist\",\"password\":\"wrong-pass\"}")
                .andExpect(status().isUnauthorized());
    }

    @Test
    void 名字和密碼格式不對會回中文錯誤() throws Exception {
        send(post("/api/auth/register"), null, "{\"username\":\"ab\",\"password\":\"guppy-1234\"}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value("名字要 3～20 個字"));
        send(post("/api/auth/register"), null, "{\"username\":\"水族人\",\"password\":\"short\"}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value("密碼要 8～72 個字"));
    }

    @Test
    void 沒登入或登出後不能讀存檔() throws Exception {
        send(get("/api/save"), null, null).andExpect(status().isUnauthorized());
        String token = register("logout_test");
        send(get("/api/me"), token, null).andExpect(status().isOk()).andExpect(jsonPath("$.username").value("logout_test"));
        send(post("/api/auth/logout"), token, null).andExpect(status().isNoContent());
        send(get("/api/me"), token, null).andExpect(status().isUnauthorized());
    }

    @Test
    void 上傳下載存檔_另一台裝置先上傳會衝突_可以強制覆蓋() throws Exception {
        String token = register("cloud_saver");
        send(get("/api/save"), token, null).andExpect(status().isNotFound());
        send(put("/api/save"), token, saveBody(0, 1000, false)).andExpect(status().isOk()).andExpect(jsonPath("$.revision").value(1));
        JsonNode got = json.readTree(send(get("/api/save"), token, null).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(got.get("revision").asLong()).isEqualTo(1);
        assertThat(got.get("save").get("state").get("hours").asInt()).isEqualTo(12);
        // 手機上傳了第 2 版
        send(put("/api/save"), token, saveBody(1, 2000, false)).andExpect(status().isOk());
        // 電腦還以為是第 1 版
        send(put("/api/save"), token, saveBody(1, 1500, false))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.revision").value(2)).andExpect(jsonPath("$.savedAt").value(2000));
        send(put("/api/save"), token, saveBody(1, 1500, true)).andExpect(status().isOk()).andExpect(jsonPath("$.revision").value(3));
    }

    @Test
    void 不是存檔或太大的資料不收() throws Exception {
        String token = register("bad_saver");
        send(put("/api/save"), token, "{\"baseRevision\":0,\"save\":{\"hello\":1}}").andExpect(status().isBadRequest());
        String big = "x".repeat(3000);
        send(put("/api/save"), token, "{\"baseRevision\":0,\"save\":{\"version\":3,\"savedAt\":1,\"state\":{\"pad\":\"" + big + "\"}}}")
                .andExpect(status().isPayloadTooLarge());
    }

    @Test
    void 密碼錯太多次會暫時鎖住() throws Exception {
        register("locked_out");
        for (int i = 0; i < 8; i++)
            send(post("/api/auth/login"), null, "{\"username\":\"locked_out\",\"password\":\"nope-nope\"}").andExpect(status().isUnauthorized());
        send(post("/api/auth/login"), null, "{\"username\":\"locked_out\",\"password\":\"guppy-1234\"}").andExpect(status().isTooManyRequests());
    }

    @Test
    void 每個帳號的存檔分開() throws Exception {
        String a = register("tank_a");
        String b = register("tank_b");
        send(put("/api/save"), a, saveBody(0, 1000, false)).andExpect(status().isOk());
        send(get("/api/save"), b, null).andExpect(status().isNotFound());
    }
}
