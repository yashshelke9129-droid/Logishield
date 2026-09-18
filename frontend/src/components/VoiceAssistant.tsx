"use client";

import {
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  Bot,
  Loader2,
  Mic,
  Send,
  Volume2,
  X,
  Square,
} from "lucide-react";


type AssistantMessage = {
  role: "user" | "assistant";
  content: string;
};


type ToolCall = {
  name: string;

  arguments: Record<
    string,
    unknown
  >;

  result: Record<
    string,
    any
  >;
};


type AssistantResponse = {
  ok: boolean;

  assistant_message: string;

  tool_calls?: ToolCall[];
};


type Insight = {
  shipment?: Record<
    string,
    any
  >;

  product?: Record<
    string,
    any
  >;

  vehicle?: Record<
    string,
    any
  >;

  route?: Record<
    string,
    any
  >;

  alternatives?: Record<
    string,
    any
  >[];

  weather?: Record<
    string,
    any
  >;
};


interface SpeechRecognitionLike {

  lang: string;

  continuous: boolean;

  interimResults: boolean;

  maxAlternatives: number;

  start: () => void;

  stop: () => void;

  abort: () => void;

  onstart:
    | (() => void)
    | null;

  onresult:
    | ((event: any) => void)
    | null;

  onerror:
    | ((event: any) => void)
    | null;

  onend:
    | (() => void)
    | null;
}


type SpeechRecognitionConstructor =
  new () => SpeechRecognitionLike;


declare global {

  interface Window {

    SpeechRecognition?:
      SpeechRecognitionConstructor;

    webkitSpeechRecognition?:
      SpeechRecognitionConstructor;
  }
}


const API_URL = (
  process.env.NEXT_PUBLIC_API_URL
  ||
  "http://127.0.0.1:8000"
).replace(
  /\/$/,
  ""
);


export default function VoiceAssistant() {

  const [
    open,
    setOpen
  ] = useState(false);


  const [
    listening,
    setListening
  ] = useState(false);


  const [
    processing,
    setProcessing
  ] = useState(false);


  const [
    transcript,
    setTranscript
  ] = useState("");


  const [
    draft,
    setDraft
  ] = useState("");


  const [
    messages,
    setMessages
  ] = useState<
    AssistantMessage[]
  >([]);


  const [
    error,
    setError
  ] = useState("");


  const [
    insight,
    setInsight
  ] = useState<
    Insight | null
  >(null);


  const recognitionRef =
    useRef<
      SpeechRecognitionLike | null
    >(null);


  const finalTranscriptRef =
    useRef("");


  const speechSupported =
    useMemo(() => {

      if (
        typeof window
        === "undefined"
      ) {
        return false;
      }

      return Boolean(
        window.SpeechRecognition
        ||
        window.webkitSpeechRecognition
      );

    }, []);


  useEffect(() => {

    return () => {

      try {

        recognitionRef.current
          ?.abort();

      } catch {}

      if (
        typeof window
        !== "undefined"
      ) {

        window.speechSynthesis
          ?.cancel();
      }
    };

  }, []);


  function speak(
    text: string
  ) {

    if (
      typeof window
      === "undefined"
    ) {
      return;
    }

    if (
      !window.speechSynthesis
    ) {
      return;
    }

    window.speechSynthesis
      .cancel();


    const utterance =
      new SpeechSynthesisUtterance(
        text
      );


    utterance.lang =
      "en-IN";


    utterance.rate =
      0.96;


    utterance.pitch =
      1;


    const voices =
      window.speechSynthesis
        .getVoices();


    const indianVoice =
      voices.find(
        (voice) =>
          voice.lang
            .toLowerCase()
            .includes(
              "en-in"
            )
      );


    if (
      indianVoice
    ) {
      utterance.voice =
        indianVoice;
    }


    window.speechSynthesis
      .speak(
        utterance
      );
  }


  async function sendCommand(
    command: string
  ) {

    const clean =
      command.trim();


    if (
      !clean
      ||
      processing
    ) {
      return;
    }


    setError("");

    setProcessing(true);

    setDraft("");

    setTranscript("");


    const nextMessages: AssistantMessage[] =
      [
        ...messages,

        {
          role: "user",
          content: clean,
        },
      ];


    setMessages(
      nextMessages
    );


    try {

      const response =
        await fetch(
          `${API_URL}/api/v1/ai/command`,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify(
              {
                command:
                  clean,

                history:
                  nextMessages
                    .slice(-12),
              }
            ),
          }
        );


      const body =
        await response
          .json()
          .catch(
            () => null
          );


      if (
        !response.ok
      ) {

        throw new Error(
          body?.detail
          ||
          `AI assistant request failed (${response.status}).`
        );
      }


      const data =
        body as AssistantResponse;


      const assistantMessage =
        data.assistant_message
          ?.trim()
        ||
        "No response returned.";


      const successfulTool =
        [
          ...(data.tool_calls || [])
        ]
          .reverse()
          .find(
            (call) =>
              call.result?.ok
          );


      if (
        successfulTool?.name
        ===
        "create_and_analyze_shipment"
      ) {

        setInsight({

          shipment:
            successfulTool
              .result
              .shipment,

          product:
            successfulTool
              .result
              .product,

          vehicle:
            successfulTool
              .result
              .vehicle,

          route:
            successfulTool
              .result
              .recommended_route,

          alternatives:
            successfulTool
              .result
              .alternative_routes,

          weather:
            successfulTool
              .result
              .weather,
        });

      } else if (
        successfulTool?.name
        ===
        "get_route_intelligence"
      ) {

        setInsight({

          route:
            successfulTool
              .result
              .recommended_route,

          alternatives:
            successfulTool
              .result
              .alternatives,

          weather:
            successfulTool
              .result
              .weather,
        });

      } else if (
        successfulTool?.name
        ===
        "get_shipment_intelligence"
      ) {

        setInsight({

          shipment:
            successfulTool
              .result
              .shipment,

          product:
            successfulTool
              .result
              .product,

          vehicle:
            successfulTool
              .result
              .vehicle,

          route:
            successfulTool
              .result
              .route,

          weather:
            successfulTool
              .result
              .weather,
        });
      }


      setMessages(
        (current) => [
          ...current,

          {
            role:
              "assistant",

            content:
              assistantMessage,
          },
        ]
      );


      speak(
        assistantMessage
      );


      if (
        data.tool_calls?.some(
          (call) =>
            call.name
              ===
            "create_and_analyze_shipment"
            &&
            call.result?.ok
        )
      ) {

        window.dispatchEvent(
          new CustomEvent(
            "logishield:shipment-created"
          )
        );
      }

    } catch (err) {

      const message =
        err instanceof Error
          ? err.message
          : (
              "Unable to contact "
              +
              "the AI assistant."
            );


      setError(
        message
      );


      speak(
        "I could not complete that request."
      );

    } finally {

      setProcessing(
        false
      );
    }
  }


  function startListening() {

    setError("");


    const Constructor =
      window.SpeechRecognition
      ||
      window.webkitSpeechRecognition;


    if (!Constructor) {

      setError(
        "Voice recognition is not supported in this browser. Use Chrome or type the command below."
      );

      return;
    }


    try {

      recognitionRef.current
        ?.abort();

    } catch {}


    const recognition =
      new Constructor();


    recognition.lang =
      "en-IN";


    recognition.continuous =
      false;


    recognition.interimResults =
      true;


    recognition.maxAlternatives =
      1;


    finalTranscriptRef.current =
      "";


    recognition.onstart =
      () => {

        setListening(
          true
        );

        setTranscript(
          ""
        );
      };


    recognition.onresult =
      (
        event: any
      ) => {

        let interim =
          "";

        let finalText =
          finalTranscriptRef.current;


        for (
          let index =
            event.resultIndex;

          index <
            event.results.length;

          index += 1
        ) {

          const result =
            event.results[
              index
            ];


          const text =
            result?.[0]
              ?.transcript
            ||
            "";


          if (
            result.isFinal
          ) {

            finalText +=
              `${text} `;

          } else {

            interim +=
              text;
          }
        }


        finalTranscriptRef.current =
          finalText;


        setTranscript(
          `${finalText}${interim}`.trim()
        );


        if (
          finalText.trim()
        ) {

          setDraft(
            finalText.trim()
          );
        }
      };


    recognition.onerror =
      (
        event: any
      ) => {

        setListening(
          false
        );


        if (
          event?.error
          ===
          "not-allowed"
        ) {

          setError(
            "Microphone permission was blocked. Allow microphone access and try again."
          );

        } else {

          setError(
            "Voice recognition failed. Please try again."
          );
        }
      };


    recognition.onend =
      () => {

        setListening(
          false
        );

        const command =
          finalTranscriptRef
            .current
            .trim();


        if (
          command
          &&
          !processing
        ) {

          sendCommand(
            command
          );
        }
      };


    recognitionRef.current =
      recognition;


    try {

      recognition.start();

    } catch (err) {

      setListening(
        false
      );

      setError(
        err instanceof Error
          ? err.message
          : "Unable to start microphone."
      );
    }
  }


  function stopListening() {

    try {

      recognitionRef.current
        ?.stop();

    } catch {}

    setListening(
      false
    );
  }


  function handleSubmit(
    event: FormEvent
  ) {

    event.preventDefault();

    sendCommand(
      draft
    );
  }


  return (
    <>
      <button
        type="button"
        onClick={() =>
          setOpen(true)
        }
        className="fixed bottom-6 right-6 z-40 flex h-16 w-16 items-center justify-center rounded-full border border-cyan-300/30 bg-[#071018] text-cyan-300 shadow-[0_0_35px_rgba(94,234,212,0.18)] transition hover:scale-105 hover:border-cyan-300/50"
        aria-label="Open LogiShield AI"
      >
        <Mic size={26} />
      </button>


      {open && (
        <div className="fixed inset-0 z-50">

          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => {
              if (!processing) {
                setOpen(false);
              }
            }}
          />


          <section className="absolute bottom-5 right-5 flex max-h-[85vh] w-[min(94vw,520px)] flex-col overflow-hidden rounded-3xl border border-white/[0.08] bg-[#080d13] shadow-[0_30px_100px_rgba(0,0,0,0.55)]">

            <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">

              <div className="flex items-center gap-3">

                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-300/[0.06] text-cyan-300">
                  <Bot size={19} />
                </div>

                <div>

                  <div className="text-[8px] font-bold tracking-[0.16em] text-cyan-300/60">
                    LOGISHIELD AI
                  </div>

                  <div className="mt-1 text-sm font-semibold text-slate-200">
                    Logistics Voice Assistant
                  </div>

                </div>

              </div>


              <button
                type="button"
                onClick={() => {
                  if (!processing) {
                    setOpen(false);
                  }
                }}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.07] text-slate-500 hover:text-slate-200"
                aria-label="Close assistant"
              >
                <X size={17} />
              </button>

            </div>


            <div className="flex-1 overflow-y-auto p-5">

              {messages.length === 0 &&
                !listening &&
                !processing && (
                  <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-7 text-center">

                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-cyan-300/20 bg-cyan-300/[0.05] text-cyan-300">
                      <Mic size={30} />
                    </div>

                    <div className="mt-6 text-sm font-semibold text-slate-300">
                      Speak a logistics command
                    </div>

                    <div className="mt-2 text-xs leading-5 text-slate-600">
                      Add shipments, ask for routes, costs or weather intelligence.
                    </div>

                  </div>
                )}


              {insight && (
                <div className="mt-5 space-y-2 rounded-2xl border border-cyan-300/10 bg-cyan-300/[0.025] p-4">

                  <div className="text-[8px] font-bold tracking-[0.15em] text-cyan-300/65">
                    LOGISHIELD INTELLIGENCE
                  </div>


                  {insight.shipment?.shipment_code && (
                    <div className="grid grid-cols-2 gap-2 text-[9px]">

                      <div className="rounded-lg bg-white/[0.025] p-2">

                        <div className="text-slate-700">
                          SHIPMENT
                        </div>

                        <div className="mt-1 font-semibold text-slate-300">
                          {insight.shipment.shipment_code}
                        </div>

                      </div>


                      <div className="rounded-lg bg-white/[0.025] p-2">

                        <div className="text-slate-700">
                          STATUS
                        </div>

                        <div className="mt-1 font-semibold text-slate-300">
                          {insight.shipment.status}
                        </div>

                      </div>

                    </div>
                  )}


                  {insight.route && (
                    <div className="grid grid-cols-2 gap-2 text-[9px]">

                      <div className="rounded-lg bg-white/[0.025] p-2">

                        <div className="text-slate-700">
                          ROUTE
                        </div>

                        <div className="mt-1 font-semibold text-slate-300">
                          {insight.route.route_code}
                        </div>

                      </div>


                      <div className="rounded-lg bg-white/[0.025] p-2">

                        <div className="text-slate-700">
                          COST
                        </div>

                        <div className="mt-1 font-semibold text-slate-300">
                          ₹
                          {Number(
                            insight.route.base_cost_inr || 0
                          ).toLocaleString("en-IN")}
                        </div>

                      </div>


                      <div className="rounded-lg bg-white/[0.025] p-2">

                        <div className="text-slate-700">
                          DISTANCE
                        </div>

                        <div className="mt-1 font-semibold text-slate-300">
                          {insight.route.distance_km} km
                        </div>

                      </div>


                      <div className="rounded-lg bg-white/[0.025] p-2">

                        <div className="text-slate-700">
                          RISK
                        </div>

                        <div className="mt-1 font-semibold text-slate-300">
                          {insight.route.risk_score}
                        </div>

                      </div>

                    </div>
                  )}


                  {insight.weather?.origin?.available && (
                    <div className="rounded-lg bg-white/[0.025] p-3 text-[9px]">

                      <div className="text-slate-700">
                        WEATHER FORECAST
                      </div>

                      <div className="mt-2 grid grid-cols-2 gap-2">

                        <div>

                          <div className="text-slate-600">
                            Origin
                          </div>

                          <div className="mt-1 font-semibold text-slate-300">
                            {
                              insight.weather
                                .origin
                                .condition
                            }
                          </div>

                          <div className="mt-1 text-slate-500">
                            {
                              insight.weather
                                .origin
                                .temperature_min_c
                            }
                            °–
                            {
                              insight.weather
                                .origin
                                .temperature_max_c
                            }
                            °C ·
                            {
                              insight.weather
                                .origin
                                .precipitation_probability
                            }
                            % rain
                          </div>

                        </div>


                        {insight.weather.destination?.available && (
                          <div>

                            <div className="text-slate-600">
                              Destination
                            </div>

                            <div className="mt-1 font-semibold text-slate-300">
                              {
                                insight.weather
                                  .destination
                                  .condition
                              }
                            </div>

                            <div className="mt-1 text-slate-500">
                              {
                                insight.weather
                                  .destination
                                  .temperature_min_c
                              }
                              °–
                              {
                                insight.weather
                                  .destination
                                  .temperature_max_c
                              }
                              °C ·
                              {
                                insight.weather
                                  .destination
                                  .precipitation_probability
                              }
                              % rain
                            </div>

                          </div>
                        )}

                      </div>

                    </div>
                  )}

                </div>
              )}


              {messages.map(
                (
                  message,
                  index
                ) => (

                  <div
                    key={`${message.role}-${index}`}
                    className={`mt-4 flex ${
                      message.role === "user"
                        ? "justify-end"
                        : "justify-start"
                    }`}
                  >

                    <div
                      className={`max-w-[88%] rounded-2xl px-4 py-3 text-xs leading-5 ${
                        message.role === "user"
                          ? "bg-cyan-300 text-[#061015]"
                          : "border border-white/[0.07] bg-white/[0.025] text-slate-300"
                      }`}
                    >

                      {message.content}

                    </div>

                  </div>
                )
              )}


              {listening && (
                <div className="mt-5 rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.035] p-5 text-center">

                  <div className="mx-auto flex h-16 w-16 animate-pulse items-center justify-center rounded-full bg-cyan-300/10 text-cyan-300">

                    <Mic size={24} />

                  </div>


                  <div className="mt-4 text-xs font-bold text-cyan-300">
                    LISTENING
                  </div>


                  <div className="mt-2 text-[10px] leading-5 text-slate-500">
                    {transcript || "Speak now..."}
                  </div>

                </div>
              )}


              {processing && (
                <div className="mt-5 flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] px-4 py-3 text-xs text-slate-500">

                  <Loader2
                    size={16}
                    className="animate-spin text-cyan-300"
                  />

                  LogiShield AI is checking database, routes and forecast data...

                </div>
              )}


              {error && (
                <div className="mt-5 rounded-2xl border border-red-400/15 bg-red-400/[0.04] px-4 py-3 text-[10px] leading-5 text-red-300">
                  {error}
                </div>
              )}

            </div>


            <div className="border-t border-white/[0.06] p-4">

              <div className="mb-3 flex items-center justify-between">

                <span className="text-[8px] font-bold tracking-[0.14em] text-slate-600">
                  VOICE COMMAND
                </span>

                <span className="text-[8px] text-slate-700">
                  {speechSupported
                    ? "Microphone ready"
                    : "Type command"}
                </span>

              </div>


              <form
                onSubmit={
                  handleSubmit
                }
                className="flex gap-2"
              >

                <input
                  value={draft}
                  onChange={(event) =>
                    setDraft(
                      event.target.value
                    )
                  }
                  placeholder="Type or speak a command..."
                  className="min-w-0 flex-1 rounded-xl border border-white/[0.07] bg-[#05080d] px-4 py-3 text-xs text-slate-200 outline-none placeholder:text-slate-700 focus:border-cyan-300/30"
                />


                <button
                  type="button"
                  onClick={
                    listening
                      ? stopListening
                      : startListening
                  }
                  disabled={
                    processing
                  }
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition disabled:opacity-40 ${
                    listening
                      ? "border-red-400/25 bg-red-400/10 text-red-300"
                      : "border-cyan-300/20 bg-cyan-300/[0.06] text-cyan-300 hover:bg-cyan-300/10"
                  }`}
                  aria-label={
                    listening
                      ? "Stop listening"
                      : "Start listening"
                  }
                >

                  {listening
                    ? <Square size={15} />
                    : <Mic size={17} />
                  }

                </button>


                <button
                  type="submit"
                  disabled={
                    !draft.trim()
                    ||
                    processing
                  }
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-cyan-300 text-[#061015] disabled:cursor-not-allowed disabled:opacity-30"
                  aria-label="Send command"
                >

                  <Send size={16} />

                </button>

              </form>


              <div className="mt-3 flex items-center gap-2 text-[8px] text-slate-700">

                <Volume2 size={11} />

                Responses are spoken back automatically.

              </div>

            </div>

          </section>

        </div>
      )}

    </>
  );
}