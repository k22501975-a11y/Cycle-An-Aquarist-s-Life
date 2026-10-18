package tw.cycle.server.push;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;
import org.springframework.stereotype.Component;

@Component
public class HttpPushTransport implements PushTransport {
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).followRedirects(HttpClient.Redirect.NEVER).build();

    @Override
    public int post(URI endpoint, Map<String, String> headers, byte[] body) throws Exception {
        HttpRequest.Builder req = HttpRequest.newBuilder(endpoint).timeout(Duration.ofSeconds(15)).POST(HttpRequest.BodyPublishers.ofByteArray(body));
        headers.forEach(req::header);
        return http.send(req.build(), HttpResponse.BodyHandlers.discarding()).statusCode();
    }
}
