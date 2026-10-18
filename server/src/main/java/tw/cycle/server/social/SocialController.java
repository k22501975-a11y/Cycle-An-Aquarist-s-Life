package tw.cycle.server.social;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import tw.cycle.server.auth.AuthInterceptor;

@RestController
@RequestMapping("/api")
public class SocialController {
    private final SocialService social;

    public SocialController(SocialService social) {
        this.social = social;
    }

    public record CodeBody(@NotBlank(message = "請輸入好友碼") String code) {}

    public record GiftBody(@NotBlank String to, @NotBlank String kind, @NotNull JsonNode payload) {}

    @GetMapping("/friends")
    public SocialService.Overview overview(@RequestAttribute(AuthInterceptor.ACCOUNT_ID) Long me) {
        return social.overview(me);
    }

    @PostMapping("/friends/request")
    public Map<String, Object> request(@RequestAttribute(AuthInterceptor.ACCOUNT_ID) Long me, @Valid @RequestBody CodeBody body) {
        return social.request(me, body.code());
    }

    @PostMapping("/friends/{username}/accept")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void accept(@RequestAttribute(AuthInterceptor.ACCOUNT_ID) Long me, @PathVariable String username) {
        social.accept(me, username);
    }

    @PostMapping("/friends/{username}/decline")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void decline(@RequestAttribute(AuthInterceptor.ACCOUNT_ID) Long me, @PathVariable String username) {
        social.decline(me, username);
    }

    @DeleteMapping("/friends/{username}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void unfriend(@RequestAttribute(AuthInterceptor.ACCOUNT_ID) Long me, @PathVariable String username) {
        social.unfriend(me, username);
    }

    @GetMapping("/friends/{username}/tank")
    public Map<String, Object> visit(@RequestAttribute(AuthInterceptor.ACCOUNT_ID) Long me, @PathVariable String username) throws Exception {
        return social.visit(me, username);
    }

    @PostMapping("/friends/{username}/like")
    public Map<String, Object> like(@RequestAttribute(AuthInterceptor.ACCOUNT_ID) Long me, @PathVariable String username) {
        return Map.of("likes", social.like(me, username));
    }

    @PostMapping("/gifts")
    public Map<String, Object> send(@RequestAttribute(AuthInterceptor.ACCOUNT_ID) Long me, @Valid @RequestBody GiftBody body) throws Exception {
        return social.send(me, body.to(), body.kind(), body.payload());
    }

    @GetMapping("/gifts")
    public List<SocialService.Gift> inbox(@RequestAttribute(AuthInterceptor.ACCOUNT_ID) Long me) {
        return social.inbox(me);
    }

    @PostMapping("/gifts/{id}/claim")
    public SocialService.Gift claim(@RequestAttribute(AuthInterceptor.ACCOUNT_ID) Long me, @PathVariable long id) {
        return social.claim(me, id);
    }
}
