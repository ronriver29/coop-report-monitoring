import express from 'express';
import { GoogleGenAI } from "@google/genai";
import { protect } from '../middleware/auth.ts';

const router = express.Router();

const getAIClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
};

/**
 * @swagger
 * /api/gemini/suggest-document:
 *   post:
 *     summary: Generate document finding evaluations via Gemini AI
 *     description: Leverages generative AI (Gemini model) to synthesize a professional CDA-specific observation statement (evaluation remark) for a cooperative document under compliance evaluation.
 *     tags: [AI Support]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - cooperativeName
 *               - documentLabel
 *             properties:
 *               cooperativeName:
 *                 type: string
 *                 example: Taguig Multi-purpose Cooperative
 *               cooperativeType:
 *                 type: string
 *                 example: Credit
 *               documentLabel:
 *                 type: string
 *                 example: Articles of Cooperation
 *               currentStatus:
 *                 type: string
 *                 example: Not Complying
 *     responses:
 *       200:
 *         description: Professional evaluation remarks generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 suggestion:
 *                   type: string
 *                   example: Articles of Cooperation require verification of general membership signatures and physical stamps.
 *       400:
 *         description: Missing required fields (Cooperative Name or Document Label)
 *       401:
 *         description: Unauthenticated
 *       500:
 *         description: AI generative model invocation failure
 */
router.post('/suggest-document', protect, async (req, res) => {
  try {
    const { cooperativeName, cooperativeType, documentLabel, currentStatus } = req.body;

    if (!cooperativeName || !documentLabel) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const ai = getAIClient();
    const prompt = `You are a professional compliance evaluator for the Cooperative Development Authority (CDA).
      
      CONTEXT:
      Cooperative Name: ${cooperativeName}
      Cooperative Type: ${cooperativeType}
      Document Type: ${documentLabel}
      Current Compliance Status: ${currentStatus || 'Not Complying'}
      
      TASK: 
      Generate a professional, concise, and formal "Summary of Findings" (evaluation remarks) for this specific document.
      
      GUIDELINES:
      - 2 sentences maximum.
      - Be technical and sector-appropriate.
      - Use professional terminology.
      - Do not use placeholders.
      - If "Not Complying", suggest what is missing or incorrect based on document type.
      - If "Complying", confirm full verification.`;

    const result = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt
    });

    const suggestion = result.text?.replace(/[*#]/g, '').trim();
    res.json({ suggestion });
  } catch (error: any) {
    console.error('AI Suggestion Error:', error);
    res.status(500).json({ message: error.message || 'Failed to generate AI suggestion' });
  }
});

/**
 * @swagger
 * /api/gemini/summarize-evaluation:
 *   post:
 *     summary: Generate final compliance evaluation synthesis via Gemini AI
 *     description: Aggregates documentary findings for various legal/financial components and synthesizes a high-level closing recommendation summary.
 *     tags: [AI Support]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - cooperativeName
 *               - findings
 *             properties:
 *               cooperativeName:
 *                 type: string
 *                 example: Taguig Multi-purpose Cooperative
 *               findings:
 *                 type: string
 *                 example: "Articles of Cooperation: Complying; Bylaws: Corrected; Financial Statements: Missing CPA auditor seal."
 *     responses:
 *       200:
 *         description: Final evaluation summary findings generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 suggestion:
 *                   type: string
 *                   example: The cooperative demonstrates major regulatory adherence with a pending check required on financial statement certifications.
 *       400:
 *         description: Missing required fields
 *       412:
 *         description: API Key is unconfigured
 *       500:
 *         description: Generative model query error
 */
router.post('/summarize-evaluation', protect, async (req, res) => {
  try {
    const { cooperativeName, findings } = req.body;

    if (!cooperativeName || !findings) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const ai = getAIClient();
    const prompt = `You are a professional compliance evaluator for the CDA.
      Provide a comprehensive final evaluation summary for: ${cooperativeName}
      
      DETAILED DOCUMENT FINDINGS:
      ${findings}
      
      TASK:
      Generate a final 2-3 sentence overview that synthesizes these findings into a formal recommendation. Be direct and official.`;

    const result = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt
    });

    const suggestion = result.text?.replace(/[*#]/g, '').trim();
    res.json({ suggestion });
  } catch (error: any) {
    console.error('AI Summary Error:', error);
    res.status(500).json({ message: error.message || 'Failed to generate AI summary' });
  }
});

export default router;
