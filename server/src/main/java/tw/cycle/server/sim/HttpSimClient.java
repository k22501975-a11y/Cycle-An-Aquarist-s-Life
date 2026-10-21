package tw.cycle.server.sim;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;
import tw.cycle.server.config.CycleProperties;

/** 用內部 HTTP 呼叫 Node 模擬小服務。 */
@Component
public class HttpSimClient implements SimClient {
    private final CycleProperties.Sim config;
    private final ObjectMapper json;
    private final HttpClient http;

    public HttpSimClient(CycleProperties props, ObjectMapper json) {
        this.config = props.sim();
        this.json = json;
        this.http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build();
    }

    @Override
    public boolean enabled() {
        return config.url() != null && !config.url().isBlank();
    }

    @Override
    public Advance advance(JsonNode save, long now) {
        JsonNode r = call("/advance", Map.of("save", save, "now", now));
        return new Advance(r.path("save"), r.path("hours").asDouble(), r.path("capped").asBoolean(), r.path("deaths").asInt(), r.path("births").asInt());
    }

    @Override
    public List<Problem> verify(JsonNode previous, JsonNode next, long elapsedMs, List<JsonNode> shipped, List<JsonNode> received) {
        JsonNode r = call("/verify", Map.of("previous", previous, "next", next, "elapsedMs", elapsedMs, "shipped", shipped, "received", received));
        List<Problem> out = new ArrayList<>();
        for (JsonNode p : r.path("problems")) out.add(new Problem(p.path("code").asText(), p.path("message").asText()));
        return out;
    }

    @Override
    public Inspect inspect(JsonNode save, long fishId) {
        JsonNode r = call("/inspect", Map.of("save", save, "fishId", fishId));
        return new Inspect(r.path("found").asBoolean(), r.path("alive").asBoolean(), r.path("item"));
    }

    @Override
    public List<Arrival> arrivals(JsonNode save, List<ArrivalQuery> orders) {
        JsonNode r = call("/arrivals", Map.of("save", save, "orders", orders));
        List<Arrival> out = new ArrayList<>();
        for (JsonNode a : r.path("arrivals"))
            out.add(new Arrival(a.path("order").asLong(), a.path("status").asText(), a.path("survived").asBoolean(), a.path("sellerFault").asBoolean()));
        return out;
    }

    private JsonNode call(String path, Map<String, Object> body) {
        if (!enabled()) throw new Unavailable("沒有設定模擬服務", null);
        try {
            HttpRequest.Builder req = HttpRequest.newBuilder(URI.create(config.url().replaceAll("/+$", "") + path))
                    .timeout(Duration.ofSeconds(config.timeoutSeconds()))
                    .header("content-type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofByteArray(json.writeValueAsBytes(body)));
            if (config.token() != null && !config.token().isBlank()) req.header("x-sim-token", config.token());
            HttpResponse<byte[]> res = http.send(req.build(), HttpResponse.BodyHandlers.ofByteArray());
            // 413：存檔大到模擬服務收不下，檢查不了就當成存檔有問題（#74），不能當成服務掛了而放行
            if (res.statusCode() == 413) throw new BadSave("存檔太大，伺服器檢查不了");
            if (res.statusCode() != 200 && res.statusCode() != 422) throw new Unavailable("模擬服務回應 " + res.statusCode(), null);
            JsonNode out = json.readTree(res.body());
            if (res.statusCode() == 422) throw new BadSave(out.path("message").asText("讀不出這份存檔"));
            return out;
        } catch (IOException e) {
            throw new Unavailable("連不上模擬服務", e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new Unavailable("連不上模擬服務", e);
        }
    }

    /** 模擬服務讀不出存檔（壞掉，或比伺服器的模擬新）。 */
    public static class BadSave extends RuntimeException {
        public BadSave(String message) {
            super(message);
        }
    }
}
