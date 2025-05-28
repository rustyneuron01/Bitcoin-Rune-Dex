import { type IArrayList } from "../types/types";

const ADMIN_ADDRESS = process.env.ADMIN_PAYMENT_ADDRESS;

export const chooseWinner = async (array: Array<string>) => {
  const item = array[Math.floor(Math.random() * array.length)];
  return item;
};

export const toXOnly = (pubkey: Buffer): Buffer => {
  return pubkey.subarray(1, 33);
};

export const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

export const calcTokenBalance = (
  tokenAmount: number,
  constantValue: number
) => {
  return Math.floor((constantValue * 10 ** 8) / tokenAmount);
};

export const splitUsers = async (finalTxArray: IArrayList[]) => {
  const users = finalTxArray.concat();
  const splitUserArray = [];
  const splitRuneInfo = [];
  while (1) {
    if (users.length === 0) break;
    if (users.length < 8) {
      const tempArray: IArrayList[] = users.splice(0, users.length);
      const totalTokenAmount = tempArray.reduce(
        (accumulator, currentValue) => accumulator + currentValue.amount,
        0
      );
      splitRuneInfo.push({
        address: ADMIN_ADDRESS,
        amount: totalTokenAmount,
        id: "",
      });
      splitUserArray.push({
        users: tempArray,
        tokenAmount: totalTokenAmount,
      });
      break;
    } else {
      const tempArray: IArrayList[] = users.splice(0, 8);
      const totalTokenAmount = tempArray.reduce(
        (accumulator, currentValue) => accumulator + currentValue.amount,
        0
      );
      splitRuneInfo.push({
        address: ADMIN_ADDRESS,
        amount: totalTokenAmount,
        id: "",
      });
      splitUserArray.push({
        users: tempArray,
        tokenAmount: totalTokenAmount,
      });
    }
  }
  return { splitUserArray, splitRuneInfo };
};
