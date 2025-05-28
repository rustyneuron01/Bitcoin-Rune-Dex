import { default as mongoose, Schema } from "mongoose";

const EtchingRuneSchema = new Schema(
  {
    sendBTCTxId: { type: String, default: "" },
    txId: { type: String, default: "" },
    divisibility: { type: Number, default: 0 },
    runeName: { type: String },
    runeSymbol: { type: String },
    runeId: { type: String, default: "" },
    runeAmount: { type: Number, default: 0 },
    remainAmount: { type: Number, default: 0 },
    initialPrice: { type: Number, default: 0 },
    psbt: { type: String, default: "" },
    creatorAddress: { type: String, default: "" },
    status: { type: Number, default: 0 },
  },
  {
    timestamps: {
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  }
);

export default mongoose.model("EtchingRuneSchema", EtchingRuneSchema);
