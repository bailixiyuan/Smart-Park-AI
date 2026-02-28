import { GoogleGenAI, Type } from "@google/genai";
import { AiAnalysisResult } from "../types";

let ai: GoogleGenAI | null = null;

const getAiClient = () => {
  if (!ai) {
    const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn("Gemini API Key is missing. AI features will not work.");
      // Return a dummy object or throw, but better to just return null and handle it
      return null;
    }
    ai = new GoogleGenAI({ apiKey });
  }
  return ai;
};

export const analyzeParkingPhoto = async (base64Image: string): Promise<AiAnalysisResult> => {
  try {
    const client = getAiClient();
    if (!client) {
      throw new Error("Gemini API Key is not configured.");
    }

    // We strip the data url prefix if present to get raw base64
    const base64Data = base64Image.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, "");
    
    const response = await client.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: base64Data
            }
          },
          {
            text: "分析这张停车照片。识别楼层（例如 B1, Level 2）、停车位号码，并提供周围环境的简短视觉描述（地标、颜色、柱子），以便稍后找到车子。请用中文（简体）回答。"
          }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            floor: { type: Type.STRING, description: "The floor level if visible, otherwise null" },
            spotNumber: { type: Type.STRING, description: "The parking spot number if visible, otherwise null" },
            description: { type: Type.STRING, description: "A short, helpful visual description of where the car is parked in Chinese" }
          }
        }
      }
    });

    const text = response.text;
    if (!text) {
      throw new Error("No response from Gemini");
    }

    return JSON.parse(text) as AiAnalysisResult;
  } catch (error) {
    console.error("Gemini analysis failed:", error);
    // Return empty result on failure to not block the user flow
    return {
      floor: null,
      spotNumber: null,
      description: null
    };
  }
};