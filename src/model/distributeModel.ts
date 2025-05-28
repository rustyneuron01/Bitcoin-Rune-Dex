import { default as mongoose, Schema } from "mongoose";

const DistributeSchema = new Schema({
  latestBlock: { type: Number, require: true },
});

export default mongoose.model("DistributeSchema", DistributeSchema);
