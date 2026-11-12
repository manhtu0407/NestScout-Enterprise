export const localGatewayEvents = {
  "approval": [
    {
      "type": "run_started",
      "conversation_id": "f82bf4d3-efe2-41c7-b6c1-856f2a6bb178",
      "request_id": "fbff7041-d73d-4391-8f73-36b6a657dd42",
      "replayed": false,
      "v": 1,
      "run_id": "0f4819eb-c634-42fc-8447-96ccb6d4f530",
      "seq": 1
    },
    {
      "type": "tool_started",
      "call_id": "call_e42cfba4",
      "tool": "task_create",
      "label": "Đang ghi nhận việc cần làm",
      "v": 1,
      "run_id": "0f4819eb-c634-42fc-8447-96ccb6d4f530",
      "seq": 2
    },
    {
      "type": "task_updated",
      "task": {
        "id": "872c1d9e-b700-4972-b42b-145cb180cb25",
        "title": "Synthetic local service request",
        "kind": "service_request",
        "status": "running",
        "version": 1,
        "summary": ""
      },
      "v": 1,
      "run_id": "0f4819eb-c634-42fc-8447-96ccb6d4f530",
      "seq": 3
    },
    {
      "type": "tool_completed",
      "call_id": "call_e42cfba4",
      "tool": "task_create",
      "outcome": "succeeded",
      "label": "Đang ghi nhận việc cần làm",
      "v": 1,
      "run_id": "0f4819eb-c634-42fc-8447-96ccb6d4f530",
      "seq": 4
    },
    {
      "type": "tool_started",
      "call_id": "call_f782d146",
      "tool": "service_request_draft",
      "label": "Đang chuẩn bị bản nháp yêu cầu",
      "v": 1,
      "run_id": "0f4819eb-c634-42fc-8447-96ccb6d4f530",
      "seq": 5
    },
    {
      "type": "task_updated",
      "task": {
        "id": "872c1d9e-b700-4972-b42b-145cb180cb25",
        "title": "Synthetic local service request",
        "kind": "service_request",
        "status": "running",
        "version": 2,
        "summary": "Bản nháp đã đủ thông tin, chưa gửi"
      },
      "v": 1,
      "run_id": "0f4819eb-c634-42fc-8447-96ccb6d4f530",
      "seq": 6
    },
    {
      "type": "tool_completed",
      "call_id": "call_f782d146",
      "tool": "service_request_draft",
      "outcome": "succeeded",
      "label": "Đang chuẩn bị bản nháp yêu cầu",
      "v": 1,
      "run_id": "0f4819eb-c634-42fc-8447-96ccb6d4f530",
      "seq": 7
    },
    {
      "type": "tool_started",
      "call_id": "call_b798834e",
      "tool": "service_request_submit",
      "label": "Đang chuẩn bị bước xác nhận",
      "v": 1,
      "run_id": "0f4819eb-c634-42fc-8447-96ccb6d4f530",
      "seq": 8
    },
    {
      "type": "task_updated",
      "task": {
        "id": "872c1d9e-b700-4972-b42b-145cb180cb25",
        "title": "Synthetic local service request",
        "kind": "service_request",
        "status": "waiting_for_approval",
        "version": 3,
        "summary": "Đang chờ bạn xác nhận gửi yêu cầu"
      },
      "v": 1,
      "run_id": "0f4819eb-c634-42fc-8447-96ccb6d4f530",
      "seq": 9
    },
    {
      "type": "approval_required",
      "approval": {
        "id": "6eef31d1-f376-43fb-b86c-def5722f1f7a",
        "task_id": "872c1d9e-b700-4972-b42b-145cb180cb25",
        "tool": "service_request_submit",
        "summary": "Gửi yêu cầu dịch vụ",
        "fingerprint": "56e97c69c05c742cd04abd0c9f9847bfb2705d471026a62132b105c2c7ea875d",
        "kind": "confirm",
        "expires_at": "2026-11-04T14:31:40.289225+00:00",
        "details": {
          "Mô tả": "Synthetic local repair",
          "Địa điểm": "Synthetic local location",
          "Thời gian mong muốn": "Synthetic local time"
        }
      },
      "v": 1,
      "run_id": "0f4819eb-c634-42fc-8447-96ccb6d4f530",
      "seq": 10
    },
    {
      "type": "tool_completed",
      "call_id": "call_b798834e",
      "tool": "service_request_submit",
      "outcome": "approval_required",
      "label": "Đang chuẩn bị bước xác nhận",
      "v": 1,
      "run_id": "0f4819eb-c634-42fc-8447-96ccb6d4f530",
      "seq": 11
    },
    {
      "type": "message_delta",
      "text": "Prepared, not submitted.",
      "v": 1,
      "run_id": "0f4819eb-c634-42fc-8447-96ccb6d4f530",
      "seq": 12
    },
    {
      "type": "run_completed",
      "text": "Prepared, not submitted.",
      "v": 1,
      "run_id": "0f4819eb-c634-42fc-8447-96ccb6d4f530",
      "seq": 13
    }
  ],
  "submitted": [
    {
      "type": "run_started",
      "conversation_id": "d88c2c39-7eaf-4972-ab9a-6c249b76a500",
      "request_id": "f5036bdb-4222-40e5-83bb-489989435966",
      "replayed": false,
      "v": 1,
      "run_id": "bfbc6043-c5d7-49b4-a854-9fba2532d1a6",
      "seq": 1
    },
    {
      "type": "tool_started",
      "call_id": "approval:c5e16909-a61a-4f48-836e-6fdb2ba5b884",
      "tool": "service_request_submit",
      "label": "Đang gửi yêu cầu dịch vụ",
      "v": 1,
      "run_id": "bfbc6043-c5d7-49b4-a854-9fba2532d1a6",
      "seq": 2
    },
    {
      "type": "tool_completed",
      "call_id": "approval:c5e16909-a61a-4f48-836e-6fdb2ba5b884",
      "tool": "service_request_submit",
      "outcome": "succeeded",
      "label": "Đang gửi yêu cầu dịch vụ",
      "v": 1,
      "run_id": "bfbc6043-c5d7-49b4-a854-9fba2532d1a6",
      "seq": 3
    },
    {
      "type": "task_updated",
      "task": {
        "id": "42fe78e8-4e1d-4d2a-89c9-4e9ea3222de2",
        "title": "Synthetic local service request",
        "kind": "service_request",
        "status": "completed",
        "version": 5,
        "summary": "Đã gửi yêu cầu dịch vụ; chưa có thợ hay lịch hẹn được xác nhận"
      },
      "v": 1,
      "run_id": "bfbc6043-c5d7-49b4-a854-9fba2532d1a6",
      "seq": 4
    },
    {
      "type": "message_delta",
      "text": "Đã gửi yêu cầu dịch vụ (mã 4aba0630). Chưa có thợ hay lịch hẹn nào được xác nhận. Khi có báo giá, bạn xem và chấp nhận trong mục Báo giá; Kael chỉ tìm thợ sau khi bạn chấp nhận.",
      "v": 1,
      "run_id": "bfbc6043-c5d7-49b4-a854-9fba2532d1a6",
      "seq": 5
    },
    {
      "type": "run_completed",
      "text": "Đã gửi yêu cầu dịch vụ (mã 4aba0630). Chưa có thợ hay lịch hẹn nào được xác nhận. Khi có báo giá, bạn xem và chấp nhận trong mục Báo giá; Kael chỉ tìm thợ sau khi bạn chấp nhận.",
      "v": 1,
      "run_id": "bfbc6043-c5d7-49b4-a854-9fba2532d1a6",
      "seq": 6
    }
  ],
  "uncertain": [
    {
      "type": "run_started",
      "conversation_id": "5810b9b0-c6d2-4502-b4b9-7f4542ccb873",
      "request_id": "a22574d4-83d9-4529-b267-37f8b81e245f",
      "replayed": false,
      "v": 1,
      "run_id": "7c4c6002-1130-4dac-a2f2-04d3a9cb5e3e",
      "seq": 1
    },
    {
      "type": "tool_started",
      "call_id": "approval:cc513d0f-9812-4cba-ab9f-a095be3f3fc7",
      "tool": "service_request_submit",
      "label": "Đang gửi yêu cầu dịch vụ",
      "v": 1,
      "run_id": "7c4c6002-1130-4dac-a2f2-04d3a9cb5e3e",
      "seq": 2
    },
    {
      "type": "tool_completed",
      "call_id": "approval:cc513d0f-9812-4cba-ab9f-a095be3f3fc7",
      "tool": "service_request_submit",
      "outcome": "uncertain",
      "label": "Đang gửi yêu cầu dịch vụ",
      "v": 1,
      "run_id": "7c4c6002-1130-4dac-a2f2-04d3a9cb5e3e",
      "seq": 3
    },
    {
      "type": "task_updated",
      "task": {
        "id": "4e6b477d-e91e-4b0a-bd4f-0813b4053c08",
        "title": "Synthetic local service request",
        "kind": "service_request",
        "status": "paused",
        "version": 5,
        "summary": "Chưa xác định được kết quả gửi; có thể xác nhận lại an toàn"
      },
      "v": 1,
      "run_id": "7c4c6002-1130-4dac-a2f2-04d3a9cb5e3e",
      "seq": 4
    },
    {
      "type": "approval_required",
      "approval": {
        "id": "cc513d0f-9812-4cba-ab9f-a095be3f3fc7",
        "task_id": "4e6b477d-e91e-4b0a-bd4f-0813b4053c08",
        "tool": "service_request_submit",
        "summary": "Gửi yêu cầu dịch vụ",
        "fingerprint": "ae3f784996f772fd877a101832f39eb19700ee3eb8e9ba76f7696518d21f1d83",
        "kind": "reconcile",
        "expires_at": null,
        "details": {
          "Mô tả": "Synthetic local repair",
          "Địa điểm": "Synthetic local location",
          "Thời gian mong muốn": "Synthetic local time"
        }
      },
      "v": 1,
      "run_id": "7c4c6002-1130-4dac-a2f2-04d3a9cb5e3e",
      "seq": 5
    },
    {
      "type": "message_delta",
      "text": "Chưa xác định được yêu cầu đã được ghi nhận hay chưa, nên Kael chưa báo là đã gửi. Bạn có thể bấm \"Kiểm tra lại\": Kael dùng lại đúng lần gửi bạn đã xác nhận với cùng mã gửi. Nếu yêu cầu đã được ghi nhận, Kael chỉ báo lại kết quả; nếu chưa, lần gửi đó được hoàn tất. Không có yêu cầu thứ hai và không cần xác nhận lại.",
      "v": 1,
      "run_id": "7c4c6002-1130-4dac-a2f2-04d3a9cb5e3e",
      "seq": 6
    },
    {
      "type": "run_completed",
      "text": "Chưa xác định được yêu cầu đã được ghi nhận hay chưa, nên Kael chưa báo là đã gửi. Bạn có thể bấm \"Kiểm tra lại\": Kael dùng lại đúng lần gửi bạn đã xác nhận với cùng mã gửi. Nếu yêu cầu đã được ghi nhận, Kael chỉ báo lại kết quả; nếu chưa, lần gửi đó được hoàn tất. Không có yêu cầu thứ hai và không cần xác nhận lại.",
      "v": 1,
      "run_id": "7c4c6002-1130-4dac-a2f2-04d3a9cb5e3e",
      "seq": 7
    }
  ],
  "reconciled": [
    {
      "type": "run_started",
      "conversation_id": "c4525fb7-7083-4523-a5bd-017c25671bc7",
      "request_id": "04933257-3c07-41ed-8d12-8fc3932c3e7f",
      "replayed": false,
      "v": 1,
      "run_id": "4dde5dac-a8f8-4443-9382-6fdbd3387be3",
      "seq": 1
    },
    {
      "type": "tool_started",
      "call_id": "approval:cc513d0f-9812-4cba-ab9f-a095be3f3fc7",
      "tool": "service_request_submit",
      "label": "Đang kiểm tra lại yêu cầu đã xác nhận",
      "v": 1,
      "run_id": "4dde5dac-a8f8-4443-9382-6fdbd3387be3",
      "seq": 2
    },
    {
      "type": "tool_completed",
      "call_id": "approval:cc513d0f-9812-4cba-ab9f-a095be3f3fc7",
      "tool": "service_request_submit",
      "outcome": "succeeded",
      "label": "Đang kiểm tra lại yêu cầu đã xác nhận",
      "v": 1,
      "run_id": "4dde5dac-a8f8-4443-9382-6fdbd3387be3",
      "seq": 3
    },
    {
      "type": "task_updated",
      "task": {
        "id": "4e6b477d-e91e-4b0a-bd4f-0813b4053c08",
        "title": "Synthetic local service request",
        "kind": "service_request",
        "status": "completed",
        "version": 7,
        "summary": "Đã gửi yêu cầu dịch vụ; chưa có thợ hay lịch hẹn được xác nhận"
      },
      "v": 1,
      "run_id": "4dde5dac-a8f8-4443-9382-6fdbd3387be3",
      "seq": 4
    },
    {
      "type": "message_delta",
      "text": "Đã gửi yêu cầu dịch vụ (mã 0c8281d2). Chưa có thợ hay lịch hẹn nào được xác nhận. Khi có báo giá, bạn xem và chấp nhận trong mục Báo giá; Kael chỉ tìm thợ sau khi bạn chấp nhận.",
      "v": 1,
      "run_id": "4dde5dac-a8f8-4443-9382-6fdbd3387be3",
      "seq": 5
    },
    {
      "type": "run_completed",
      "text": "Đã gửi yêu cầu dịch vụ (mã 0c8281d2). Chưa có thợ hay lịch hẹn nào được xác nhận. Khi có báo giá, bạn xem và chấp nhận trong mục Báo giá; Kael chỉ tìm thợ sau khi bạn chấp nhận.",
      "v": 1,
      "run_id": "4dde5dac-a8f8-4443-9382-6fdbd3387be3",
      "seq": 6
    }
  ],
  "edgeUnavailable": [
    {
      "type": "run_started",
      "conversation_id": "104a692d-18c7-4d17-80f9-7d4517a894dc",
      "request_id": "02a3f73e-0ea7-4eaf-b900-5de2a029a044",
      "replayed": false,
      "v": 1,
      "run_id": "1f41a66f-ffab-4899-af81-1c843d8ee14e",
      "seq": 1
    },
    {
      "type": "run_failed",
      "code": "provider_unavailable",
      "message": "Mô hình AI của Kael chưa được cấu hình hoặc chưa khả dụng. Tin nhắn của bạn đã được lưu nhưng chưa được trả lời.",
      "retryable": false,
      "v": 1,
      "run_id": "1f41a66f-ffab-4899-af81-1c843d8ee14e",
      "seq": 2
    }
  ],
  "greeting": [
    {
      "type": "run_started",
      "conversation_id": "a5f3dd0b-f287-411d-8829-4daee7a7cf46",
      "request_id": "b7146be7-54f5-4b48-9114-71eca213732e",
      "replayed": false,
      "v": 1,
      "run_id": "bee00a35-e947-4ffb-ad3f-b87f548aa433",
      "seq": 1
    },
    {
      "type": "message_delta",
      "text": "Synthetic ",
      "v": 1,
      "run_id": "bee00a35-e947-4ffb-ad3f-b87f548aa433",
      "seq": 2
    },
    {
      "type": "message_delta",
      "text": "reply.",
      "v": 1,
      "run_id": "bee00a35-e947-4ffb-ad3f-b87f548aa433",
      "seq": 3
    },
    {
      "type": "run_completed",
      "text": "Synthetic reply.",
      "v": 1,
      "run_id": "bee00a35-e947-4ffb-ad3f-b87f548aa433",
      "seq": 4
    }
  ],
  "missingInput": [
    {
      "type": "run_started",
      "conversation_id": "7874fdce-47a8-4241-9d94-d464116ac431",
      "request_id": "f3b38e8e-ca52-4cad-8cb0-47148712f3d6",
      "replayed": false,
      "v": 1,
      "run_id": "e1345c5c-a2fa-44fa-a83e-5b587fddbad8",
      "seq": 1
    },
    {
      "type": "tool_started",
      "call_id": "call_c5ac4680",
      "tool": "task_create",
      "label": "Đang ghi nhận việc cần làm",
      "v": 1,
      "run_id": "e1345c5c-a2fa-44fa-a83e-5b587fddbad8",
      "seq": 2
    },
    {
      "type": "task_updated",
      "task": {
        "id": "01a3d79a-2d0a-47ab-8ad4-1ff431d15962",
        "title": "Synthetic local service request",
        "kind": "service_request",
        "status": "running",
        "version": 1,
        "summary": ""
      },
      "v": 1,
      "run_id": "e1345c5c-a2fa-44fa-a83e-5b587fddbad8",
      "seq": 3
    },
    {
      "type": "tool_completed",
      "call_id": "call_c5ac4680",
      "tool": "task_create",
      "outcome": "succeeded",
      "label": "Đang ghi nhận việc cần làm",
      "v": 1,
      "run_id": "e1345c5c-a2fa-44fa-a83e-5b587fddbad8",
      "seq": 4
    },
    {
      "type": "tool_started",
      "call_id": "call_f66086bd",
      "tool": "service_request_draft",
      "label": "Đang chuẩn bị bản nháp yêu cầu",
      "v": 1,
      "run_id": "e1345c5c-a2fa-44fa-a83e-5b587fddbad8",
      "seq": 5
    },
    {
      "type": "task_updated",
      "task": {
        "id": "01a3d79a-2d0a-47ab-8ad4-1ff431d15962",
        "title": "Synthetic local service request",
        "kind": "service_request",
        "status": "waiting_for_input",
        "version": 2,
        "summary": "Bản nháp còn thiếu: location"
      },
      "v": 1,
      "run_id": "e1345c5c-a2fa-44fa-a83e-5b587fddbad8",
      "seq": 6
    },
    {
      "type": "tool_completed",
      "call_id": "call_f66086bd",
      "tool": "service_request_draft",
      "outcome": "succeeded",
      "label": "Đang chuẩn bị bản nháp yêu cầu",
      "v": 1,
      "run_id": "e1345c5c-a2fa-44fa-a83e-5b587fddbad8",
      "seq": 7
    },
    {
      "type": "message_delta",
      "text": "Please provide a location.",
      "v": 1,
      "run_id": "e1345c5c-a2fa-44fa-a83e-5b587fddbad8",
      "seq": 8
    },
    {
      "type": "run_completed",
      "text": "Please provide a location.",
      "v": 1,
      "run_id": "e1345c5c-a2fa-44fa-a83e-5b587fddbad8",
      "seq": 9
    }
  ]
} as const;
