import * as fs from 'fs';

let logs = '';
const log = (msg: any) => { logs += (typeof msg === 'string' ? msg : JSON.stringify(msg, null, 2)) + '\n'; };

function textFingerprint(text: string): string {
    return text
        .toLowerCase()
        .replace(/[\s\n\r\t]+/g, ' ')
        .replace(/^(summary|witness|analysis|history|risk assessment|dossier|bt báo cáo|phân tích|đánh giá|nhân chứng)[:\s]*/i, '')
        .trim();
}

function deduplicateSections(sections: any): any {
    const result = { ...sections };
    
    const orderedKeys = [
        'legend_overview',
        'history',
        'local_stories',
        'explanations',
        'visitor_reports',
        'risk_assessment',
    ];
    
    const renderedTexts: string[] = []; 
    
    for (const key of orderedKeys) {
        let text = result[key];
        if (!text || text.length < 10) continue;
        
        if (text.trim().startsWith('{')) {
            try {
                const p = JSON.parse(text.trim());
                text = p.legend_overview || p.story_text || p.content || text;
                result[key] = text;
            } catch { /* ignore */ }
        }

        const fp = textFingerprint(text);
        
        const isDuplicate = renderedTexts.some(prevFp => {
            if (prevFp === fp) return true;
            if (prevFp.length > 50 && fp.length > 50) {
                if (prevFp.includes(fp) || fp.includes(prevFp)) return true;
            }
            return false;
        });
        
        if (isDuplicate) {
            result[key] = '';
            log(`[DEDUP] Cleared duplicate section: ${key}`);
        } else {
            renderedTexts.push(fp);
            log(`[DEDUP] Kept section: ${key}`);
        }
    }
    
    if (sections.risk_assessment && sections.risk_assessment.length >= 10 && (!result.risk_assessment || result.risk_assessment.length < 10)) {
        result.risk_assessment = 'No additional risk assessment available.';
        log(`[DEDUP] Replaced risk_assessment with fallback`);
    }
    
    return result;
}

const testData = {
    legend_overview: `{
        "story_text": "Bệnh viện Từ Dũ, bệnh viện phụ sản lớn nhất Sài Gòn, luôn là nơi giao thoa giữa sự sống và cái chết...",
        "witness": "Vào khoảng 2 giờ sáng, khi tôi đang đi tuần tra ở khu vực nhà xác cũ, tôi nghe thấy tiếng khóc của một đứa trẻ sơ sinh...",
        "analysis": "Những câu chuyện về tiếng khóc trẻ em và bóng dáng phụ nữ tại bệnh viện Từ Dũ có thể được giải thích bằng yếu tố tâm lý...",
        "risk_assessment": {
            "credibility": "medium",
            "signal_type": "urban_legend",
            "site_sensitivity": "high",
            "recommendation": "Khu vực bệnh viện mang ý nghĩa tâm linh và cảm xúc sâu sắc. Không nên thực hiện các hoạt động khảo sát hoặc thử thách lòng can đảm tại đây."
        }
    }`,
    visitor_reports: "Vào khoảng 2 giờ sáng, khi tôi đang đi tuần tra ở khu vực nhà xác cũ, tôi nghe thấy tiếng khóc của một đứa trẻ sơ sinh...",
    explanations: "Những câu chuyện về tiếng khóc trẻ em và bóng dáng phụ nữ tại bệnh viện Từ Dũ có thể được giải thích bằng yếu tố tâm lý...",
    risk_assessment: "Khu vực bệnh viện mang ý nghĩa tâm linh và cảm xúc sâu sắc. Không nên thực hiện các hoạt động khảo sát hoặc thử thách lòng can đảm tại đây.",
    history: '',
    local_stories: ''
};

log('--- ORIGINAL SECTIONS ---');
log(testData);

log('\n--- DEDUPLICATING ---');
const dedupedInfo = deduplicateSections(testData);

log('\n--- DEDUPED SECTIONS ---');
log(dedupedInfo);

fs.writeFileSync('dedup_results.txt', logs, 'utf-8');

