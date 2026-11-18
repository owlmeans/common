import type { CapturedRequest } from './tool-fixtures.js'

/**
 * GOLDEN requests of the tool-less calls in `runGoldenCalls` (`tool-fixtures.ts`), recorded from the
 * build BEFORE the `tools` option of `ask` / `invoke` existed. A call without `tools` must send these
 * bytes unchanged — never re-record them to make a change pass.
 */
export const TOOLLESS_GOLDEN: Record<string, CapturedRequest[]> = {
  "ask": [
    {
      "messages": [
        {
          "role": "system",
          "content": [
            {
              "type": "text",
              "text": "You write files.\n\n## persona-rules\n\nRules every call of the persona follows.",
              "cache_control": {
                "type": "ephemeral"
              }
            }
          ]
        },
        {
          "role": "user",
          "content": [
            {
              "type": "text",
              "text": "Project context — facts about this project; they override general guidance where they differ.\n\nCaller system text.",
              "cache_control": {
                "type": "ephemeral"
              }
            }
          ]
        },
        {
          "lc": 1,
          "type": "constructor",
          "id": [
            "langchain_core",
            "messages",
            "HumanMessage"
          ],
          "kwargs": {
            "content": [
              {
                "type": "text",
                "text": "A source pin every call of the batch shares.",
                "cache_control": {
                  "type": "ephemeral"
                }
              }
            ],
            "additional_kwargs": {},
            "response_metadata": {}
          }
        },
        {
          "role": "user",
          "content": "Write the file.\n\n## call-rule\n\nA rule for this call only."
        }
      ],
      "options": {
        "runName": "golden-ask",
        "metadata": {
          "purpose": {
            "type": "tool-spec"
          }
        }
      }
    }
  ],
  "guided": [
    {
      "messages": [
        {
          "role": "system",
          "content": [
            {
              "type": "text",
              "text": "You write files.\n\n## persona-rules\n\nRules every call of the persona follows.",
              "cache_control": {
                "type": "ephemeral"
              }
            }
          ]
        },
        {
          "role": "user",
          "content": [
            {
              "type": "text",
              "text": "Project context — facts about this project; they override general guidance where they differ.\n\nCaller system text.",
              "cache_control": {
                "type": "ephemeral"
              }
            }
          ]
        },
        {
          "lc": 1,
          "type": "constructor",
          "id": [
            "langchain_core",
            "messages",
            "HumanMessage"
          ],
          "kwargs": {
            "content": [
              {
                "type": "text",
                "text": "A source pin every call of the batch shares.",
                "cache_control": {
                  "type": "ephemeral"
                }
              }
            ],
            "additional_kwargs": {},
            "response_metadata": {}
          }
        },
        {
          "role": "user",
          "content": "Write the file."
        }
      ],
      "options": {
        "runName": "golden-guided",
        "metadata": {
          "purpose": {
            "type": "tool-spec"
          }
        }
      }
    },
    {
      "messages": [
        {
          "role": "system",
          "content": [
            {
              "type": "text",
              "text": "You write files.\n\n## persona-rules\n\nRules every call of the persona follows.",
              "cache_control": {
                "type": "ephemeral"
              }
            }
          ]
        },
        {
          "role": "user",
          "content": [
            {
              "type": "text",
              "text": "Project context — facts about this project; they override general guidance where they differ.\n\nCaller system text.",
              "cache_control": {
                "type": "ephemeral"
              }
            }
          ]
        },
        {
          "lc": 1,
          "type": "constructor",
          "id": [
            "langchain_core",
            "messages",
            "HumanMessage"
          ],
          "kwargs": {
            "content": [
              {
                "type": "text",
                "text": "A source pin every call of the batch shares.",
                "cache_control": {
                  "type": "ephemeral"
                }
              }
            ],
            "additional_kwargs": {},
            "response_metadata": {}
          }
        },
        {
          "role": "user",
          "content": "Write the file."
        },
        {
          "role": "user",
          "content": "\"Заказы\" is not Latin."
        }
      ],
      "options": {
        "runName": "golden-guided",
        "metadata": {
          "purpose": {
            "type": "tool-spec"
          }
        }
      }
    }
  ],
  "invoke": [
    {
      "messages": [
        {
          "role": "system",
          "content": [
            {
              "type": "text",
              "text": "You write files.\n\n## persona-rules\n\nRules every call of the persona follows.",
              "cache_control": {
                "type": "ephemeral"
              }
            }
          ]
        },
        {
          "role": "user",
          "content": [
            {
              "type": "text",
              "text": "Project context — facts about this project; they override general guidance where they differ.\n\nCaller system text.",
              "cache_control": {
                "type": "ephemeral"
              }
            }
          ]
        },
        {
          "lc": 1,
          "type": "constructor",
          "id": [
            "langchain_core",
            "messages",
            "HumanMessage"
          ],
          "kwargs": {
            "content": [
              {
                "type": "text",
                "text": "A source pin every call of the batch shares.",
                "cache_control": {
                  "type": "ephemeral"
                }
              }
            ],
            "additional_kwargs": {},
            "response_metadata": {}
          }
        },
        {
          "role": "user",
          "content": "Write the file.\n\n## call-rule\n\nA rule for this call only.\nRespond with a single complete and valid JSON object only. Do not wrap it in markdown fences, and do not add any commentary, reasoning, or explanation outside the JSON. Keep string values focused — do not pad them with restated requirements or numbered summaries, so the whole object stays within the output limit and is never truncated."
        }
      ],
      "options": {
        "runName": "golden-invoke",
        "metadata": {
          "purpose": {
            "type": "tool-spec"
          }
        }
      },
      "tools": [
        {
          "type": "function",
          "function": {
            "name": "Specified",
            "description": "",
            "parameters": {
              "type": "object",
              "title": "Specified",
              "properties": {
                "title": {
                  "type": "string"
                },
                "summary": {
                  "type": "string"
                }
              },
              "required": [
                "title",
                "summary"
              ],
              "additionalProperties": false
            }
          }
        }
      ],
      "bind": {
        "tool_choice": {
          "type": "tool",
          "name": "Specified"
        }
      }
    }
  ],
  "tail": [
    {
      "messages": [
        {
          "role": "system",
          "content": [
            {
              "type": "text",
              "text": "You write files.\n\n## persona-rules\n\nRules every call of the persona follows.",
              "cache_control": {
                "type": "ephemeral"
              }
            }
          ]
        },
        {
          "role": "user",
          "content": [
            {
              "type": "text",
              "text": "Project context — facts about this project; they override general guidance where they differ.\n\nCaller system text.",
              "cache_control": {
                "type": "ephemeral"
              }
            }
          ]
        },
        {
          "lc": 1,
          "type": "constructor",
          "id": [
            "langchain_core",
            "messages",
            "HumanMessage"
          ],
          "kwargs": {
            "content": "A source pin every call of the batch shares.",
            "additional_kwargs": {},
            "response_metadata": {}
          }
        },
        {
          "role": "user",
          "content": "Write the file.\n\nAnswer with ONLY one JSON object (no prose, no code fence) that is valid against this JSON Schema:\n{\"type\":\"object\",\"title\":\"Specified\",\"properties\":{\"title\":{\"type\":\"string\"},\"summary\":{\"type\":\"string\"}},\"required\":[\"title\",\"summary\"],\"additionalProperties\":false}"
        }
      ],
      "options": {
        "runName": "golden-tail",
        "metadata": {
          "purpose": {
            "type": "tool-spec"
          }
        }
      }
    }
  ],
  "bare": [
    {
      "messages": [
        {
          "role": "user",
          "content": "Describe it.\nRespond with a single complete and valid JSON object only. Do not wrap it in markdown fences, and do not add any commentary, reasoning, or explanation outside the JSON. Keep string values focused — do not pad them with restated requirements or numbered summaries, so the whole object stays within the output limit and is never truncated."
        }
      ],
      "options": {
        "runName": "golden-bare",
        "metadata": {
          "purpose": {
            "type": "tool-spec"
          }
        }
      },
      "tools": [
        {
          "type": "function",
          "function": {
            "name": "Specified",
            "description": "",
            "parameters": {
              "type": "object",
              "title": "Specified",
              "properties": {
                "title": {
                  "type": "string"
                },
                "summary": {
                  "type": "string"
                }
              },
              "required": [
                "title",
                "summary"
              ],
              "additionalProperties": false
            }
          }
        }
      ],
      "bind": {
        "tool_choice": {
          "type": "function",
          "function": {
            "name": "Specified"
          }
        }
      }
    }
  ]
}
