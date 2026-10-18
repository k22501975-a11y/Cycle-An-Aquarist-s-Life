# AI 生成美術素材（第一批）

- 生成：本機 RTX 4090，Z-Image-Turbo（Apache-2.0）＋ComfyUI v0.41.0，8 步、cfg 1
- 風格尾巴：highly detailed digital painting, mobile game art, soft rim light, painterly, clean silhouette, realistic proportions
- `fish/`、`shrimp/`、`scape/`：白底生成後用「白色轉透明」去背（color-to-alpha；半透明鰭保留透明度），裁到內容範圍
- `bg/`：1920×1088；`bg-tank-back-2560.webp` 是 2560×1440
- `ui/`：1024 生成後縮成 512×512

| 檔案 | 說明 |
|------|------|
| fish/guppy-male-*.png | 公孔雀魚：藍草、眼鏡蛇、燕尾服（後半身偏深藍）、白子全紅 |
| fish/guppy-female-base.png、guppy-female-pregnant.png | 母孔雀魚、懷孕母魚（孕斑） |
| shrimp/shrimp-cherry-*.png | 紅米蝦：公（近透明）、母、卵鞍（背上黃綠斑，偏色塊）、抱蛋、發眼蛋 |
| scape/rock-seiryu-1..5.png | 青龍石：圓、尖柱、平板、階梯、楔形 |
| scape/wood-spider-1..3.png | 杜鵑根 |
| scape/plant-*.png | 牛毛氈、珍珠草（glosso）、圓葉、天胡荽、莫絲（底下有淡影） |
| bg/ | 後景水草層、底床（沙＋黑土） |
| ui/icon-*.png | 餵食、換水、測試劑、修剪、商店、市場、好友 |
