package tw.cycle.server.config;

import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class ErrorHandler {
    @ExceptionHandler(ApiException.class)
    ResponseEntity<Map<String, Object>> api(ApiException e) {
        if (e instanceof tw.cycle.server.save.SaveController.ConflictException c)
            return ResponseEntity.status(e.status()).body(Map.of("code", e.code(), "message", e.getMessage(), "revision", c.revision, "savedAt", c.savedAt));
        return ResponseEntity.status(e.status()).body(Map.of("code", e.code(), "message", e.getMessage()));
    }

    /** 模擬服務沒開或連不上（伺服器權威模擬 L2）。 */
    @ExceptionHandler(tw.cycle.server.sim.SimClient.Unavailable.class)
    ResponseEntity<Map<String, Object>> simDown(tw.cycle.server.sim.SimClient.Unavailable e) {
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(Map.of("code", "sim_down", "message", "伺服器的模擬暫時連不上，等一下再試"));
    }

    @ExceptionHandler(tw.cycle.server.sim.HttpSimClient.BadSave.class)
    ResponseEntity<Map<String, Object>> badSave(tw.cycle.server.sim.HttpSimClient.BadSave e) {
        return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY).body(Map.of("code", "bad_save", "message", e.getMessage()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<Map<String, Object>> invalid(MethodArgumentNotValidException e) {
        var first = e.getBindingResult().getFieldErrors().stream().findFirst();
        String message = first.map(f -> f.getDefaultMessage()).orElse("資料格式不對");
        return ResponseEntity.badRequest().body(Map.of("code", "invalid", "message", message));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    ResponseEntity<Map<String, Object>> unreadable(HttpMessageNotReadableException e) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("code", "invalid", "message", "資料格式不對"));
    }
}
