import axios from "axios";

const ocrApi = axios.create({
  baseURL: import.meta.env.VITE_OCR_API_URL,
});

export default ocrApi;
