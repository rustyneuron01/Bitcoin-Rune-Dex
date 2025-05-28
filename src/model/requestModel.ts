import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";

const RequestSchema = new mongoose.Schema({
  requestId: { type: String, default: uuidv4, unique: true },
  userId: { type: String, required: true },
  type: { type: String, required: true },
  transferAmount: { type: Number },
  destinationAddress: { type: String, required: true },
  creator: { type: String, required: true },
  cosigner: [{ type: String, required: true }],
  signedCosigner: [{ type: String, required: true }],
  psbt: [{ type: String, required: true }],
  threshold: { type: Number, required: true },
  status: { type: Number, default: 0 }, // 0: pending, 1: success, 2: failed
  createdAt: { type: Date, default: new Date() },
});

const RequestModal = mongoose.model("RequestModal", RequestSchema);

export default RequestModal;
