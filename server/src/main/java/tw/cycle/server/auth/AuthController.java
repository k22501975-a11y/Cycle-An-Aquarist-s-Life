package tw.cycle.server.auth;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import tw.cycle.server.config.ApiException;

@RestController
@RequestMapping("/api")
public class AuthController {
    private final AuthService auth;

    public AuthController(AuthService auth) {
        this.auth = auth;
    }

    public record Credentials(
            @NotBlank(message = "請輸入名字")
            @Size(min = 3, max = 20, message = "名字要 3～20 個字")
            @Pattern(regexp = "^[\\p{L}\\p{N}_]+$", message = "名字只能用中英文、數字和底線")
            String username,
            @NotBlank(message = "請輸入密碼") @Size(min = 8, max = 72, message = "密碼要 8～72 個字") String password) {}

    @PostMapping("/auth/register")
    @ResponseStatus(HttpStatus.CREATED)
    public AuthService.Login register(@Valid @RequestBody Credentials c) {
        return auth.register(c.username().trim(), c.password());
    }

    @PostMapping("/auth/login")
    public AuthService.Login login(@RequestBody Credentials c) {
        if (c.username() == null || c.password() == null) throw new ApiException(HttpStatus.BAD_REQUEST, "invalid", "請輸入名字和密碼");
        return auth.login(c.username().trim(), c.password());
    }

    @PostMapping("/auth/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void logout(@RequestAttribute(AuthInterceptor.TOKEN) String token) {
        auth.logout(token);
    }

    @GetMapping("/me")
    public Map<String, Object> me(@RequestAttribute(AuthInterceptor.ACCOUNT_ID) Long id) {
        var account = auth.account(id).orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "expired", "登入過期了，請重新登入"));
        return Map.of("username", account.getUsername());
    }
}
