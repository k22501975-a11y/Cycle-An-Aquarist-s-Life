package tw.cycle.server;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import tw.cycle.server.config.CycleProperties;
import tw.cycle.server.sim.HttpSimClient;
import tw.cycle.server.sim.SimClient;

/** 模擬服務回錯誤時，HttpSimClient 要分得出「存檔有問題」和「服務掛了」（#74）。 */
class HttpSimClientTest {
    private final ObjectMapper json = new ObjectMapper();
    private HttpServer server;

    @AfterEach
    void stop() {
        if (server != null) server.stop(0);
    }

    private HttpSimClient answering(int status, String body) throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", ex -> {
            ex.getRequestBody().readAllBytes();
            byte[] out = body.getBytes(StandardCharsets.UTF_8);
            ex.sendResponseHeaders(status, out.length);
            ex.getResponseBody().write(out);
            ex.close();
        });
        server.start();
        String url = "http://127.0.0.1:" + server.getAddress().getPort();
        CycleProperties props = new CycleProperties(null, 30, 4000000, 3, false, null, new CycleProperties.Sim(url, null, 5));
        return new HttpSimClient(props, json);
    }

    private JsonNode save() throws Exception {
        return json.readTree("{\"version\":3,\"savedAt\":1000,\"state\":{}}");
    }

    @Test
    void 存檔太大模擬服務回413_當成存檔有問題() throws Exception {
        HttpSimClient sim = answering(413, "{\"message\":\"資料太大\"}");
        assertThatThrownBy(() -> sim.verify(save(), save(), 1000, java.util.List.of(), java.util.List.of())).isInstanceOf(HttpSimClient.BadSave.class);
    }

    @Test
    void 模擬服務回500_當成服務掛了() throws Exception {
        HttpSimClient sim = answering(500, "oops");
        assertThatThrownBy(() -> sim.verify(save(), save(), 1000, java.util.List.of(), java.util.List.of())).isInstanceOf(SimClient.Unavailable.class);
    }
}
