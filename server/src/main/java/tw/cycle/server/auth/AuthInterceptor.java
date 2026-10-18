package tw.cycle.server.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;
import tw.cycle.server.config.ApiException;

/** 從 Authorization: Bearer <token> 找出帳號，放進 request 給 controller 用。 */
@Component
public class AuthInterceptor implements HandlerInterceptor {
    public static final String ACCOUNT_ID = "cycle.accountId";
    public static final String TOKEN = "cycle.token";
    private final AuthService auth;

    public AuthInterceptor(AuthService auth) {
        this.auth = auth;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if ("OPTIONS".equals(request.getMethod())) return true;
        String header = request.getHeader("Authorization");
        if (header == null || !header.startsWith("Bearer ")) throw new ApiException(HttpStatus.UNAUTHORIZED, "no_login", "請先登入");
        String token = header.substring(7).trim();
        Long id = auth.authenticate(token).orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "expired", "登入過期了，請重新登入"));
        request.setAttribute(ACCOUNT_ID, id);
        request.setAttribute(TOKEN, token);
        return true;
    }
}
