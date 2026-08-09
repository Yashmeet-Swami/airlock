import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Webhook, WebhookDelivery, WebhookDeliveryStatus, WebhookEventName } from "@airlock/shared-types";
import { apiFetch } from "../lib/apiClient.js";

export interface WebhookInput {
  url: string;
  events: WebhookEventName[];
}

export function useWebhooks() {
  return useQuery({
    queryKey: ["webhooks"],
    queryFn: () => apiFetch<Webhook[]>("/admin/webhooks"),
  });
}

export function useCreateWebhook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: WebhookInput) => apiFetch<Webhook>("/admin/webhooks", { method: "POST", body: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["webhooks"] });
    },
  });
}

export function useDeleteWebhook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/admin/webhooks/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["webhooks"] });
    },
  });
}

export function useWebhookDeliveries(webhookId: string | null, status?: WebhookDeliveryStatus) {
  return useQuery({
    queryKey: ["webhookDeliveries", webhookId, status],
    queryFn: () =>
      apiFetch<WebhookDelivery[]>(`/admin/webhooks/${webhookId}/deliveries`, { query: { status } }),
    enabled: webhookId !== null,
  });
}

export function useReplayDelivery() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (deliveryId: string) =>
      apiFetch<WebhookDelivery>(`/admin/webhooks/deliveries/${deliveryId}/replay`, { method: "POST" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["webhookDeliveries"] });
    },
  });
}
