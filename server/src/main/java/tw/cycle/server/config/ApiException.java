package tw.cycle.server.config;

import org.springframework.http.HttpStatus;

/** 回傳給遊戲的錯誤：code 給程式判斷，message 是可以直接顯示給玩家的中文。 */
public class ApiException extends RuntimeException {
    private final HttpStatus status;
    private final String code;

    public ApiException(HttpStatus status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    public HttpStatus status() {
        return status;
    }

    public String code() {
        return code;
    }
}
