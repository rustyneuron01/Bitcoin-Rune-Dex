import { default as mongoose, Schema } from "mongoose";
import { v4 as uuidv4 } from "uuid";

const WithdrawSchema = new Schema(
  {
    withdrawId: { type: String, default: uuidv4, unique: true },
    userId: { type: String, require: true },
    txId: { type: String, default: "" },
    btcAmount: { type: Number, default: "" },
    status: { type: Number, default: 0 }, // 0: Tx Requested, 1 : Tx Created, 2: Tx Completed, 3: Send Token
  },
  {
    timestamps: {
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  }
);

export default mongoose.model("withdrawBtc", WithdrawSchema);
