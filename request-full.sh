curl --location 'https://api.agora.io/api/conversational-ai-agent/v2/projects/c59e24db512b418db5a7701c1b811f7c/join' \
--header 'Authorization: agora token=007eJxTYDAO/Ti7eYq2Ib9t5WeLnc/+fznjLr5fs9l1zeO5NwrSVE8rMCSbWqYamaQkmRoaJZkYWgAZiebmBobJhkkWhoZp5smsG/dlNgQyMjxZ6srAxMAIhiC+IkNyfl5ZfmKmbnFJaUpmvm5unkG6eV5Bkm5BrlGOSWq6US4DVANIORuDsYWRsYElACAfLT0=' \
--header 'Content-Type: application/json' \
--data '{
  "name": "convoai-studio-mn0g7npb-pm2l4eg2m",
  "pipeline_id": "3ab4b17942cc4d53a4ecec7a39da91ee",
  "properties": {
    "asr": {
      "params": {
        "url": "wss://api.deepgram.com/v1/listen",
        "model": "nova-3",
        "keyterm": "",
        "language": "en"
      },
      "vendor": "deepgram"
    },
    "llm": {
      "url": "https://api.openai.com/v1/chat/completions",
      "params": {
        "model": "gpt-4.1-mini"
      },
      "vendor": "openai",
      "failure_message": "Please hold on a second.",
      "system_messages": [
        {
          "role": "system",
          "content": "You are a B2B procurement negotiation agent for buyer-side sourcing.\n\nGoal:\n- Secure the lowest achievable unit price while preserving delivery reliability and quality.\n- Keep conversation natural, concise, and professional.\n\nContext Variables:\n- Product: {{product_name}}\n- Buyer target quantity: {{quantity}}\n- Current quoted price: {{current_price_usd}} USD/unit\n- Buyer target ceiling: {{target_ceiling_usd}} USD/unit\n- Hard walk-away ceiling: {{walkaway_usd}} USD/unit\n- Preferred terms: {{payment_terms}}, {{delivery_window}}, {{warranty_terms}}\n- Competitor reference (if any): {{competitor_anchor}}\n\nOperating Rules:\n1. First confirm supplier baseline quote and constraints (MOQ, lead time, payment terms, stock).\n2. Negotiate in rounds with reasoned concessions:\n   - leverage volume commitment\n   - faster payment terms\n   - repeat-order / long-term commitment\n   - bundling opportunities\n   - close-now certainty\n3. Never invent facts or approvals.\n4. Ask one focused question at a time.\n5. If supplier rejects price drop, trade for non-price value (shipping, warranty, payment terms, MOQ flexibility).\n6. If supplier proposes a counter-offer, evaluate against walk-away ceiling and continue up to 5 rounds.\n7. If final offer <= target_ceiling_usd: mark as ACCEPT_CANDIDATE.\n8. If final offer > walkaway_usd and no extra value: mark as NO_DEAL.\n9. End with a concise recap and explicit next action.\n\nResponse Style:\n- Tone: calm, commercial, decisive.\n- Length: 1–3 short paragraphs per turn.\n- Always include current working unit price in USD when discussing offers.\n\nMandatory End-of-Call Output (exact JSON only):\n{\n  \"status\": \"ACCEPT_CANDIDATE | NO_DEAL | NEED_INTERNAL_APPROVAL\",\n  \"final_unit_price_usd\": number,\n  \"supplier_name\": string,\n  \"qty\": number,\n  \"moq\": number|null,\n  \"lead_time_days\": number|null,\n  \"payment_terms\": string|null,\n  \"non_price_concessions\": [string],\n  \"summary\": string,\n  \"confidence\": 0.0\n}"
        }
      ],
      "greeting_message": ""
    },
    "tts": {
      "params": {
        "url": "wss://api-uw.minimax.io/ws/v1/t2a_v2",
        "model": "speech-2.8-turbo",
        "voice_setting": {
          "voice_id": "English_radiant_girl"
        }
      },
      "vendor": "minimax"
    },
    "parameters": {
      "silence_config": {
        "action": "think",
        "content": "politely ask if the user is still online",
        "timeout_ms": 10000
      }
    },
    "idle_timeout": 120,
    "turn_detection": {
      "mode": "default",
      "config": {
        "end_of_speech": {
          "mode": "vad",
          "vad_config": {
            "silence_duration_ms": 640
          }
        },
        "start_of_speech": {
          "mode": "vad",
          "vad_config": {
            "prefix_padding_ms": 800,
            "interrupt_duration_ms": 160,
            "speaking_interrupt_duration_ms": 160
          }
        },
        "speech_threshold": 0.5
      }
    },
    "advanced_features": {
      "enable_rtm": true,
      "enable_sal": false,
      "enable_aivad": false
    },
    "channel": "convoai-studio-mn0g7npb-pm2l4eg2m",
    "agent_rtc_uid": "382309",
    "remote_rtc_uids": [
      "*"
    ],
    "token": "007eJxTYDAO/Ti7eYq2Ib9t5WeLnc/+fznjLr5fs9l1zeO5NwrSVE8rMCSbWqYamaQkmRoaJZkYWgAZiebmBobJhkkWhoZp5smsG/dlNgQyMjxZ6srAxMAIhiC+IkNyfl5ZfmKmbnFJaUpmvm5unkG6eV5Bkm5BrlGOSWq6US4DVANIORuDsYWRsYElACAfLT0=",
    "enable_string_uid": false
  }
}'