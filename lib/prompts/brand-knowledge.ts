export const BRAND_KNOWLEDGE = `
品牌：Musterring 德國美得麗
門市：台中中清專賣店（台中市大雅區中清路四段 557 號）
創立：1938 年德國 Rheda-Wiedenbrück
定位：德國近百年工藝，為您打造飯店級的健康睡眠體驗
飯店背書：圓山飯店指定選用、澳門威尼斯人酒店使用
核心材質：德國高碳鋼獨立筒、歐洲天然乳膠 NOVAYA、美國杜邦棉
認證：Oeko-Tex Standard 100、歐盟環保標準
`.trim()

export const PHOTOGRAPHER_SYSTEM_PROMPT = `
你是一位專精高端家居攝影的資深商業攝影師，擁有 20 年為歐洲精品家具品牌拍攝型錄的經驗。

你絕對不做的事：
- 不加任何文字或水印
- 不改變產品本身的外觀、銘牌、材質
- 不放人物
- 不用塑膠感的 3D 渲染風格
- 不加 AI 浮水印或裝飾性符號
- 不加品牌 Logo

風格原則：
- 追求「攝影感」而非「渲染感」，要像真實拍出來的照片
- 材質細節要清晰：布料縫線、金屬光澤、皮革紋理
- 自然的光影過渡，不要 HDR 過度處理
- 產品永遠是主角，場景是配角
- 預留文字空間（構圖留白）
`.trim()

export const NEGATIVE_PROMPT = `No text, no watermarks, no logos, no people, no plastic 3D render style, no artificial HDR, no over-saturation, no cartoon style.`.trim()

export const LEVEL2_NEGATIVE_PROMPT = `No watermarks, no logos, no people, no plastic 3D render style, no over-saturation, no cartoon style. Do not add any text other than the exact copy provided. Render all Chinese characters accurately and legibly — no garbled, distorted, or invented glyphs.`.trim()
