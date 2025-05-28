import txListModel from "../model/txListModel";
import etchingRuneModel from "../model/etchingRuneModel";
import { TxListStatus } from "../config/constant";
import { type IArrayList } from "../types/types";

export const getRuneToken = async (runeDocument: any) => {
  let buyAmount = 0,
    sellAmount = 0;
  const buyDocumentSum = await txListModel.aggregate([
    {
      $match: {
        status: TxListStatus.PENDING,
        type: 0,
        runeName: {
          $regex: runeDocument.runeName.toLocaleLowerCase(),
          $options: "i",
        },
      },
    },
    {
      $group: {
        _id: null,
        totalAmount: { $sum: "$runeAmount" },
      },
    },
    { $unset: ["_id"] },
  ]);
  const sellDocumentSum = await txListModel.aggregate([
    {
      $match: {
        status: TxListStatus.PENDING,
        type: 1,
        runeName: {
          $regex: runeDocument.runeName.toLocaleLowerCase(),
          $options: "i",
        },
      },
    },
    {
      $group: {
        _id: null,
        totalAmount: { $sum: "$runeAmount" },
      },
    },
    { $unset: ["_id"] },
  ]);

  if (buyDocumentSum.length !== 0) buyAmount = buyDocumentSum[0].totalAmount;
  if (sellDocumentSum.length !== 0) sellAmount = sellDocumentSum[0].totalAmount;

  return runeDocument.remainAmount + sellAmount - buyAmount;
};

export const getTxListObjectViaId = async (id: string) => {
  const document = await txListModel.findById(id);
  return document;
};

export const getEtchingRuneObjectViaName = async (runeName: string) => {
  const runeDocument: any = await etchingRuneModel.findOne({
    runeName: { $regex: runeName.toLocaleLowerCase(), $options: "i" },
  });
  return runeDocument;
};

export const getPendingBTCObjects = async () => {
  let totalBtcAmount = 0;
  const btcAddressList: IArrayList[] = [];
  const pendingBTCDocuments = await txListModel.find({
    type: 1,
    // status: TxListStatus.COMPLETED,
  });

  for (const document of pendingBTCDocuments) {
    btcAddressList.push({
      address: document.receiveAddress as string,
      amount: document.btcAmount,
      id: document.id,
    });
    totalBtcAmount += document.btcAmount;
  }

  return { btcAddressList, totalBtcAmount };
};

export const getPendingRuneObjets = async () => {
  let pendingRuneArray: Record<string, IArrayList[]> = {};
  const runeArrayList: string[] = [];
  const allRunes: any = await etchingRuneModel.find();
  for (const eachRune of allRunes) {
    const pendingDocument = await txListModel.aggregate([
      {
        $match: {
          type: 0,
          runeName: {
            $regex: eachRune.runeName.toLocaleLowerCase(),
            $options: "i",
          },
          // status: TxListStatus.COMPLETED,
        },
      },
      { $limit: 64 },
    ]);
    if (pendingDocument.length === 0) continue;
    runeArrayList.push(pendingDocument[0].runeId);
    const newFilterArray: IArrayList[] = [];
    for (const eachDocument of pendingDocument) {
      newFilterArray.push({
        address: eachDocument.receiveAddress as string,
        amount: eachDocument.runeAmount,
        id: eachDocument._id.toString(),
      });
    }
    pendingRuneArray[pendingDocument[0].runeId] = newFilterArray;
  }

  return { pendingRuneArray, runeArrayList };
};
