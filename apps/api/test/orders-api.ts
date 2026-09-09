import type { Express } from "express";
import request from "supertest";
import { authHeader } from "./helpers.js";

export async function patchOrder(
  app: Express,
  token: string,
  accountId: string,
  orderId: string,
  body: object,
): Promise<request.Response> {
  return await request(app)
    .patch(`/api/v1/accounts/${accountId}/orders/${orderId}`)
    .set(authHeader(token))
    .send(body);
}

export async function deleteOrder(
  app: Express,
  token: string,
  accountId: string,
  orderId: string,
  body: object,
): Promise<request.Response> {
  return await request(app)
    .delete(`/api/v1/accounts/${accountId}/orders/${orderId}`)
    .set(authHeader(token))
    .send(body);
}

export async function getOrder(
  app: Express,
  token: string,
  accountId: string,
  orderId: string,
): Promise<request.Response> {
  return await request(app)
    .get(`/api/v1/accounts/${accountId}/orders/${orderId}`)
    .set(authHeader(token));
}

export async function getAccountOrders(
  app: Express,
  token: string,
  accountId: string,
  query = "",
): Promise<request.Response> {
  return await request(app)
    .get(`/api/v1/accounts/${accountId}/orders${query}`)
    .set(authHeader(token));
}

export async function getOrders(
  app: Express,
  token: string,
  query = "",
): Promise<request.Response> {
  return await request(app).get(`/api/v1/orders${query}`).set(authHeader(token));
}

export async function getTrades(
  app: Express,
  token: string,
  accountId: string,
  query = "",
): Promise<request.Response> {
  return await request(app)
    .get(`/api/v1/accounts/${accountId}/trades${query}`)
    .set(authHeader(token));
}
