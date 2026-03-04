const express = require('express');
const path = require('path');
const tencentcloud = require('tencentcloud-sdk-nodejs-ocr');
const tencentcloudTmt = require('tencentcloud-sdk-nodejs-tmt');

const app = express();
const PORT = 3000;

// 解析JSON请求体，设置较大的限制以支持Base64图片
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// 静态文件服务
app.use(express.static(path.join(__dirname)));

// ==================== 配置区域 ====================
// 请在此处填入你的腾讯云API密钥
const TENCENT_SECRET_ID = process.env.TENCENT_SECRET_ID || 'AKIDGGzU8Wb00viFYPetUr0pN4MPCm8GD61W1';
const TENCENT_SECRET_KEY = process.env.TENCENT_SECRET_KEY || '1NUHp8E4uXFPJL5uSxAAwQfiAL4httrBI1';
const TENCENT_REGION = 'ap-guangzhou'; // 可选: ap-beijing, ap-shanghai, ap-guangzhou 等
// ==================================================

// 初始化腾讯云OCR客户端
const OcrClient = tencentcloud.ocr.v20181119.Client;
const ocrClientConfig = {
    credential: {
        secretId: TENCENT_SECRET_ID,
        secretKey: TENCENT_SECRET_KEY,
    },
    region: TENCENT_REGION,
    profile: {
        httpProfile: {
            endpoint: 'ocr.tencentcloudapi.com',
        },
    },
};
const ocrClient = new OcrClient(ocrClientConfig);

// 初始化腾讯云翻译客户端
const TmtClient = tencentcloudTmt.tmt.v20180321.Client;
const tmtClientConfig = {
    credential: {
        secretId: TENCENT_SECRET_ID,
        secretKey: TENCENT_SECRET_KEY,
    },
    region: TENCENT_REGION,
    profile: {
        httpProfile: {
            endpoint: 'tmt.tencentcloudapi.com',
        },
    },
};
const tmtClient = new TmtClient(tmtClientConfig);

// OCR识别接口
app.post('/api/ocr', async (req, res) => {
    try {
        const { image } = req.body;
        
        if (!image) {
            return res.json({ success: false, error: '请提供图片' });
        }

        console.log('开始OCR识别...');
        
        // 调用腾讯云通用文字识别（高精度版）
        const params = {
            ImageBase64: image,
        };

        const result = await ocrClient.GeneralAccurateOCR(params);
        
        console.log('OCR识别完成，识别到', result.TextDetections?.length || 0, '个文本块');
        
        // 转换结果格式
        const textBlocks = (result.TextDetections || []).map(item => ({
            text: item.DetectedText,
            confidence: item.Confidence,
            polygon: item.Polygon || item.ItemPolygon?.map(p => ({ X: p.X, Y: p.Y })) || []
        }));

        res.json({ success: true, data: textBlocks });
        
    } catch (error) {
        console.error('OCR识别失败:', error);
        res.json({ 
            success: false, 
            error: error.message || 'OCR识别失败',
            code: error.code
        });
    }
});

// 免费翻译函数 (使用 MyMemory API)
async function translateText(text, from = 'en', to = 'zh-CN') {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${from}|${to}`;
    const response = await fetch(url);
    const data = await response.json();
    if (data.responseStatus === 200 && data.responseData) {
        return data.responseData.translatedText;
    }
    return text;
}

// 翻译接口
app.post('/api/translate', async (req, res) => {
    try {
        const { texts, from = 'en', to = 'zh-CN' } = req.body;
        
        if (!texts || !Array.isArray(texts) || texts.length === 0) {
            return res.json({ success: false, error: '请提供要翻译的文本' });
        }

        console.log('开始翻译', texts.length, '个文本...');
        
        // 批量翻译
        const translations = [];
        
        for (const text of texts) {
            try {
                // 如果文本为空或只有数字/符号，跳过翻译
                if (!text || !/[a-zA-Z]/.test(text)) {
                    translations.push(text);
                    continue;
                }
                
                const result = await translateText(text, from, to);
                translations.push(result || text);
                
                // 添加延迟避免请求过快
                await new Promise(resolve => setTimeout(resolve, 100));
                
            } catch (e) {
                console.error('翻译单个文本失败:', e.message);
                translations.push(text); // 翻译失败时使用原文
            }
        }

        console.log('翻译完成');
        
        res.json({ success: true, translations });
        
    } catch (error) {
        console.error('翻译失败:', error);
        res.json({ 
            success: false, 
            error: error.message || '翻译失败',
            code: error.code
        });
    }
});

// 启动服务器
app.listen(PORT, () => {
    console.log('========================================');
    console.log('  图片OCR翻译工具已启动');
    console.log(`  访问地址: http://localhost:${PORT}`);
    console.log('========================================');
    console.log('');
    console.log('使用前请确保已配置腾讯云API密钥:');
    console.log('  方式1: 修改 server.js 中的 TENCENT_SECRET_ID 和 TENCENT_SECRET_KEY');
    console.log('  方式2: 设置环境变量 TENCENT_SECRET_ID 和 TENCENT_SECRET_KEY');
    console.log('');
});
