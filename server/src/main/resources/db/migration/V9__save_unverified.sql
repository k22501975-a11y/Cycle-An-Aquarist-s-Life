-- 伺服器權威模擬（L2，#76）：第一次上傳、強制覆蓋的存檔沒有跟上一份比對過，
-- 標成未驗證，市場不能上架魚，等之後上傳的存檔跟最後一份驗證過的比對通過才解除
ALTER TABLE cloud_save ADD COLUMN unverified BOOLEAN NOT NULL DEFAULT FALSE;
-- 強制覆蓋前最後一份驗證過的存檔（和伺服器收下它的時間）
ALTER TABLE cloud_save ADD COLUMN verified_data TEXT;
ALTER TABLE cloud_save ADD COLUMN verified_at TIMESTAMP WITH TIME ZONE;
