package tw.cycle.server.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * 請求大小的整體上限（#79）：最大的是上傳存檔，比存檔上限多留一點給外層欄位。
 * 沒帶長度（分段傳）的請求不擋，存檔大小在 SaveController 另外檢查。
 */
@Component
public class BodyLimitFilter extends OncePerRequestFilter {
    /** 存檔以外的欄位（baseRevision、force）用不到這麼多。 */
    private static final long ENVELOPE_BYTES = 16 * 1024;

    private final long limit;

    public BodyLimitFilter(CycleProperties props) {
        this.limit = props.maxSaveBytes() + ENVELOPE_BYTES;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain) throws ServletException, IOException {
        if (request.getContentLengthLong() > limit) {
            response.setStatus(413);
            response.setContentType("application/json;charset=UTF-8");
            response.getOutputStream().write("{\"code\":\"too_large\",\"message\":\"資料太大了\"}".getBytes(StandardCharsets.UTF_8));
            return;
        }
        chain.doFilter(request, response);
    }
}
