import axios from "axios";
import { MEMPOOL_URL } from "../config/config";

export const getBlockHeight = async () => {
  try {
    const url = `${MEMPOOL_URL}/blocks/tip/height`;

    const res = await axios.get(url);
    return Number(res.data);
  } catch (error) {
    console.log("Mempool API is not working for fetch block height");
    return -1;
  }
};

export const getTxStatus = async (tx: string) => {
  try {
    const url = `${MEMPOOL_URL}/tx/${tx}/status`;
    const res = await axios.get(url);

    return {
      confirmed: res.data.confirmed,
      blockHeight: res.data.block_height,
    };
  } catch (error) {
    // console.log("Get TX Status Failed", error);
    return {
      confirmed: false,
      blockHeight: 0,
    };
  }
};

export const getFeeRate = async () => {
  try {
    const url = `${MEMPOOL_URL}/v1/fees/recommended`;

    const res = await axios.get(url);
    return Math.round(Number(res.data.fastestFee) * 1.25);
  } catch (error) {
    console.log("Ordinal api is not working now. Try again later");
    return 40;
  }
};
