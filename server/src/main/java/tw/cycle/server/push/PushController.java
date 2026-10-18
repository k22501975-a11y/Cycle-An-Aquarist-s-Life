package tw.cycle.server.push;

import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import tw.cycle.server.auth.AuthService;

/** 推播不用登入也能開（水缸預警）；有帶登入 token 的話，市場和好友的通知也會送到這台。 */
@RestController
@RequestMapping("/api/push")
public class PushController {
    private final PushService push;
    private final AuthService auth;

    public PushController(PushService push, AuthService auth) {
        this.push = push;
        this.auth = auth;
    }

    public record DeviceBody(String secret, String endpoint, String p256dh, String auth, List<String> categories) {}

    public record SecretBody(String secret) {}

    public record ScheduleBody(String secret, List<PushService.Planned> items) {}

    @GetMapping("/key")
    public Map<String, String> key() {
        return Map.of("publicKey", push.publicKey());
    }

    @PutMapping("/devices/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void register(@PathVariable String id, @RequestBody DeviceBody body, HttpServletRequest request) {
        push.register(id, body.secret(), body.endpoint(), body.p256dh(), body.auth(), body.categories() == null ? List.of() : body.categories(), account(request));
    }

    @DeleteMapping("/devices/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void unregister(@PathVariable String id, @RequestBody SecretBody body) {
        push.unregister(id, body.secret());
    }

    @PutMapping("/devices/{id}/schedule")
    public Map<String, Integer> schedule(@PathVariable String id, @RequestBody ScheduleBody body) {
        return Map.of("scheduled", push.schedule(id, body.secret(), body.items()));
    }

    private Long account(HttpServletRequest request) {
        String header = request.getHeader("Authorization");
        if (header == null || !header.startsWith("Bearer ")) return null;
        return auth.authenticate(header.substring(7).trim()).orElse(null);
    }
}
