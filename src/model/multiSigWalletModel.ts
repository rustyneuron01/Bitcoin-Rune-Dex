import mongoose from "mongoose";

const Multisig = new mongoose.Schema({
  userId: { type: String, required: true },
  cosigner: [{ type: String, required: true }],
  witnessScript: { type: String, required: true },
  p2msOutput: { type: String, required: true },
  address: { type: String, required: true },
  threshold: { type: Number, required: true },
  createdAt: { type: Date, default: new Date() },
});

const MultisigModal = mongoose.model("multisig", Multisig);

export default MultisigModal;
