import { randomUUID } from "crypto";
import {
  BAD_GATEWAY,
  BAD_REQUEST,
  INTERNAL_SERVER_ERROR,
  NOT_FOUND,
  UNPROCESSABLE_ENTITY,
} from "http-status";
import {
  deleteCommand,
  getCommand,
  putCommand,
  scanCommand,
  updateCommand,
} from "./dynamodb";
import { Role, User } from "../models";
import { buildExpressions } from "../utils/dynamoDbHelper";

const { DYNAMODB_TABLE_USERS } = process.env;
const tableUsers = `${DYNAMODB_TABLE_USERS}`;

class UsersError extends Error {
  statusCode: number = INTERNAL_SERVER_ERROR;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.name = "UsersError";
  }
}

const get = async (uuid: string | number): Promise<User> => {
  const { Item } = await getCommand({ TableName: tableUsers, Key: { uuid } });
  return Item as User;
};

const getById = async (id: string | number): Promise<User | undefined> => {
  const { Items } = await scanCommand({
    TableName: tableUsers,
    ProjectionExpression: "#uuid, #id",
    ExpressionAttributeNames: {
      "#uuid": "uuid",
      "#id": "id",
    },
    ExpressionAttributeValues: {
      ":id": id,
    },
    FilterExpression: "id = :id",
  });
  
  if (!Items?.length) {
    return;
  }

  if (Items?.length > 1) {
    throw new UsersError("Unprocessable entity", UNPROCESSABLE_ENTITY);
  }

  const [Item] = Items;
  return get(Item?.uuid);
};

const create = async (
  params: User,
  editAsAdmin: boolean = false
): Promise<User> => {
  const timestamp = new Date().getTime();
  const uuid = randomUUID();
  const user: User = {
    uuid,
    id: params?.id,
    role: editAsAdmin ? params?.role : Role.USER,
    username: params?.username ?? "",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await putCommand({ TableName: tableUsers, Item: user });
  return get(uuid);
};

const update = async (
  params: User,
  editAsAdmin: boolean = false
): Promise<User> => {
  if (!params?.uuid) {
    throw new UsersError("Bad request", BAD_REQUEST);
  }

  const Item = await get(params?.uuid);
  if (!Item) {
    throw new UsersError("Not found", NOT_FOUND);
  }

  if (!Item?.uuid) {
    throw new UsersError("Bad gateway", BAD_GATEWAY);
  }

  const timestamp = new Date().getTime();
  const user: User = {
    ...Item,
    username: params?.username ?? "",
    updatedAt: timestamp,
  };
  delete user?.uuid;

  if (editAsAdmin) {
    user.id = params?.id;
    user.role = params?.role;
    user.apiKey = params?.apiKey ?? "";
  }

  const {
    ExpressionAttributeNames,
    ExpressionAttributeValues,
    UpdateExpression,
  } = buildExpressions(user);

  await updateCommand({
    TableName: tableUsers,
    Key: { uuid: Item?.uuid },
    ExpressionAttributeValues,
    UpdateExpression,
    ExpressionAttributeNames,
  });

  return get(Item?.uuid);
};

const remove = async (uuid: string | number) => {
  await deleteCommand({ TableName: tableUsers, Key: { uuid } });
};

export default { get, getById, create, update, remove };
