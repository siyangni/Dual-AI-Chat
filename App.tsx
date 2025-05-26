import React, { useState, useEffect, useRef } from 'react';
import { ChatMessage, MessageSender, MessagePurpose } from './types';
import { generateResponse } from './services/geminiService';
import { GrokService } from './services/grokService';
import ChatInput from './components/ChatInput';
import MessageBubble from './components/MessageBubble';
import Notepad from './components/Notepad';
import {
  MODELS,
  DEFAULT_MODEL_API_NAME,
  COGNITO_SYSTEM_PROMPT_HEADER,
  MUSE_SYSTEM_PROMPT_HEADER,
  DEFAULT_MANUAL_FIXED_TURNS,
  MIN_MANUAL_FIXED_TURNS,
  MAX_MANUAL_FIXED_TURNS,
  MAX_AI_DRIVEN_DISCUSSION_TURNS_PER_MODEL,
  INITIAL_NOTEPAD_CONTENT,
  NOTEPAD_INSTRUCTION_PROMPT_PART,
  NOTEPAD_UPDATE_TAG_START,
  NOTEPAD_UPDATE_TAG_END,
  DISCUSSION_COMPLETE_TAG,
  AI_DRIVEN_DISCUSSION_INSTRUCTION_PROMPT_PART,
  DiscussionMode,
  AiModel
} from './constants';
import { BotMessageSquare, AlertTriangle, RefreshCcw, SlidersHorizontal, Cpu, MessagesSquare, Bot } from 'lucide-react';

interface ParsedAIResponse {
  spokenText: string;
  newNotepadContent: string | null;
  discussionShouldEnd?: boolean;
}

const parseAIResponse = (responseText: string): ParsedAIResponse => {
  let currentText = responseText.trim();
  let spokenText = ""; // This will hold the text part before any tags
  let newNotepadContent: string | null = null;
  let discussionShouldEnd = false;
  
  let notepadActionText = "";
  let discussionActionText = "";

  // 1. Check for notepad update (must be at the very end)
  const notepadStartIndex = currentText.lastIndexOf(NOTEPAD_UPDATE_TAG_START);
  const notepadEndIndex = currentText.lastIndexOf(NOTEPAD_UPDATE_TAG_END);

  if (notepadStartIndex !== -1 && notepadEndIndex !== -1 && notepadEndIndex > notepadStartIndex && currentText.endsWith(NOTEPAD_UPDATE_TAG_END)) {
    newNotepadContent = currentText.substring(notepadStartIndex + NOTEPAD_UPDATE_TAG_START.length, notepadEndIndex).trim();
    // Text before notepad update becomes the base for spokenText
    spokenText = currentText.substring(0, notepadStartIndex).trim(); 
    
    if (newNotepadContent) {
        notepadActionText = "更新了记事本";
    } else {
        notepadActionText = "尝试更新记事本但内容为空";
    }
  } else {
    // No valid notepad update found at the end, all text is potentially spoken or contains discussion_complete tag
    spokenText = currentText;
  }

  // 2. Check for discussion complete tag in the (potentially already processed for notepad) spokenText
  // This tag should also ideally be at the end of the spoken part.
  if (spokenText.includes(DISCUSSION_COMPLETE_TAG)) {
    discussionShouldEnd = true;
    // Remove all occurrences, though ideally there's one at the end
    spokenText = spokenText.replace(new RegExp(DISCUSSION_COMPLETE_TAG.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), "").trim();
    discussionActionText = "建议结束讨论";
  }

  // 3. Determine final spoken text if it's empty after stripping tags
  if (!spokenText.trim()) {
    if (notepadActionText && discussionActionText) {
      spokenText = `(AI ${notepadActionText}并${discussionActionText})`;
    } else if (notepadActionText) {
      spokenText = `(AI ${notepadActionText})`;
    } else if (discussionActionText) {
      spokenText = `(AI ${discussionActionText})`;
    } else {
      // This case might happen if the response was only tags or whitespace
      spokenText = "(AI 未提供额外文本回复)"; 
    }
  }
  
  return { spokenText: spokenText.trim(), newNotepadContent, discussionShouldEnd };
};


const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]); // Extract base64 data after comma
    };
    reader.onerror = (error) => reject(error);
  });
};


const App: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isApiKeyMissing, setIsApiKeyMissing] = useState<boolean>(false);
  const [currentTotalProcessingTimeMs, setCurrentTotalProcessingTimeMs] = useState<number>(0);

  const [notepadContent, setNotepadContent] = useState<string>(INITIAL_NOTEPAD_CONTENT);
  const [lastNotepadUpdateBy, setLastNotepadUpdateBy] = useState<MessageSender | null>(null);

  const [selectedModelApiName, setSelectedModelApiName] = useState<string>(DEFAULT_MODEL_API_NAME);
  const [isThinkingBudgetEnabled, setIsThinkingBudgetEnabled] = useState<boolean>(true);
  const [discussionMode, setDiscussionMode] = useState<DiscussionMode>(DiscussionMode.FixedTurns);
  const [manualFixedTurns, setManualFixedTurns] = useState<number>(DEFAULT_MANUAL_FIXED_TURNS);

  const [grokService] = useState<GrokService>(() => new GrokService(process.env.GROK_API_KEY || ''));

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const currentQueryStartTimeRef = useRef<number | null>(null);
  const cancelRequestRef = useRef<boolean>(false); // For cancelling AI response processing

  const currentModelDetails = MODELS.find(m => m.apiName === selectedModelApiName) || MODELS[0];
  const modelSupportsThinkingBudget = currentModelDetails.supportsThinkingBudget;
  const isGrokModel = selectedModelApiName.includes('grok');

  const addMessage = (
    text: string,
    sender: MessageSender,
    purpose: MessagePurpose,
    durationMs?: number,
    image?: ChatMessage['image']
  ) => {
    setMessages(prev => [...prev, {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      text,
      sender,
      purpose,
      timestamp: new Date(),
      durationMs,
      image
    }]);
  };

  const getWelcomeMessageText = (
    modelName: string, 
    currentDiscussionMode: DiscussionMode,
    currentManualFixedTurns: number
  ) => {
    let modeDescription = "";
     if (currentDiscussionMode === DiscussionMode.FixedTurns) {
      modeDescription = `固定轮次对话 (${currentManualFixedTurns}轮)`;
    } else {
      modeDescription = "AI驱动对话";
    }
    return `欢迎使用Dual AI Chat！当前模式: ${modeDescription}。在下方输入您的问题或上传图片。${MessageSender.Cognito} 和 ${MessageSender.Muse} 将进行讨论，并可能使用右侧的共享记事本。然后 ${MessageSender.Cognito} 会给您回复。当前模型: ${modelName}`;
  };
  
  const initializeChat = () => {
    setMessages([]);
    setNotepadContent(INITIAL_NOTEPAD_CONTENT);
    setLastNotepadUpdateBy(null);

    const missingGrokKey = isGrokModel && !process.env.GROK_API_KEY;
    const missingGeminiKey = !isGrokModel && !process.env.API_KEY;

    if (missingGrokKey || missingGeminiKey) {
      setIsApiKeyMissing(true);
      addMessage(
        `严重警告：${isGrokModel ? 'GROK_API_KEY' : 'API_KEY'} 未配置。请确保设置相应的环境变量，以便应用程序正常运行。`,
        MessageSender.System,
        MessagePurpose.SystemNotification
      );
    } else {
      setIsApiKeyMissing(false);
      addMessage(
        getWelcomeMessageText(currentModelDetails.name, discussionMode, manualFixedTurns),
        MessageSender.System,
        MessagePurpose.SystemNotification
      );
    }
  };

  useEffect(() => {
    initializeChat();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Runs once on mount

   useEffect(() => {
     const welcomeMessage = messages.find(msg => msg.sender === MessageSender.System && msg.text.startsWith("欢迎使用Dual AI Chat！"));
     if (welcomeMessage && !isApiKeyMissing) {
        setMessages(msgs => msgs.map(msg =>
            msg.id === welcomeMessage.id
            ? {...msg, text: getWelcomeMessageText(currentModelDetails.name, discussionMode, manualFixedTurns) }
            : msg
        ));
     }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentModelDetails.name, isApiKeyMissing, discussionMode, manualFixedTurns]);

  // Add effect to check API key when model changes
  useEffect(() => {
    const missingGrokKey = isGrokModel && !process.env.GROK_API_KEY;
    const missingGeminiKey = !isGrokModel && !process.env.API_KEY;
    
    setIsApiKeyMissing(missingGrokKey || missingGeminiKey);
    
    if (missingGrokKey || missingGeminiKey) {
      addMessage(
        `警告：${isGrokModel ? 'GROK_API_KEY' : 'API_KEY'} 未配置。请确保设置相应的环境变量，以便应用程序正常运行。`,
        MessageSender.System,
        MessagePurpose.SystemNotification
      );
    }
  }, [selectedModelApiName]);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    let intervalId: number | undefined;
    if (isLoading && currentQueryStartTimeRef.current) {
      intervalId = window.setInterval(() => {
        if (currentQueryStartTimeRef.current) { // Check if still valid
          setCurrentTotalProcessingTimeMs(performance.now() - currentQueryStartTimeRef.current);
        }
      }, 100);
    } else { // Not loading or start time ref is null
      if (intervalId) clearInterval(intervalId);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isLoading]);

  const handleClearChat = () => {
    if (isLoading) { // If it was loading, signal cancellation
      cancelRequestRef.current = true;
    }
    setIsLoading(false); // Set immediately to stop UI indicators and enable input
    
    setCurrentTotalProcessingTimeMs(0);
    if (currentQueryStartTimeRef.current) {
        currentQueryStartTimeRef.current = null;
    }

    setMessages([]);
    setNotepadContent(INITIAL_NOTEPAD_CONTENT);
    setLastNotepadUpdateBy(null);
    // setDiscussionMode(DiscussionMode.FixedTurns); // Optionally reset discussion mode
    // setManualFixedTurns(DEFAULT_MANUAL_FIXED_TURNS); // Optionally reset fixed turns

     if (!isApiKeyMissing) {
       addMessage(
        getWelcomeMessageText(currentModelDetails.name, discussionMode, manualFixedTurns),
        MessageSender.System,
        MessagePurpose.SystemNotification
      );
    } else {
         addMessage(
            "严重警告：API_KEY 未配置。请确保设置 API_KEY 环境变量，以便应用程序正常运行。",
            MessageSender.System,
            MessagePurpose.SystemNotification
      );
    }
  };
  
  const handleManualFixedTurnsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = parseInt(e.target.value, 10);
    if (isNaN(value)) {
      value = DEFAULT_MANUAL_FIXED_TURNS; 
    }
    value = Math.max(MIN_MANUAL_FIXED_TURNS, Math.min(MAX_MANUAL_FIXED_TURNS, value));
    setManualFixedTurns(value);
  };


  const handleSendMessage = async (userInput: string, imageFile?: File | null) => {
    if (isLoading || !userInput.trim()) return;
    setIsLoading(true);
    cancelRequestRef.current = false;
    currentQueryStartTimeRef.current = Date.now();

    try {
      // Add user's message
      addMessage(userInput, MessageSender.User, MessagePurpose.UserInput, undefined, 
        imageFile ? { 
          dataUrl: await fileToBase64(imageFile),
          name: imageFile.name,
          type: imageFile.type
        } : undefined
      );

      // Prepare the discussion between Cognito and Muse
      const maxTurns = discussionMode === DiscussionMode.FixedTurns 
        ? manualFixedTurns 
        : MAX_AI_DRIVEN_DISCUSSION_TURNS_PER_MODEL;
      
      let currentTurn = 0;
      let discussionComplete = false;

      while (currentTurn < maxTurns && !discussionComplete && !cancelRequestRef.current) {
        // Cognito's turn
        const cognitoPrompt = `${COGNITO_SYSTEM_PROMPT_HEADER}
${currentTurn === 0 ? `\n用户问题: ${userInput}` : ''}
${NOTEPAD_INSTRUCTION_PROMPT_PART.replace('{notepadContent}', notepadContent)}
${discussionMode === DiscussionMode.AiDriven ? AI_DRIVEN_DISCUSSION_INSTRUCTION_PROMPT_PART : ''}`;

        let cognitoResponse;
        if (isGrokModel) {
          cognitoResponse = await grokService.generateResponse(
            [...messages, { id: 'system', text: cognitoPrompt, sender: MessageSender.System, purpose: MessagePurpose.SystemNotification, timestamp: new Date() }],
            selectedModelApiName
          );
          if (cognitoResponse.error) {
            if (cognitoResponse.error.includes("API key not valid")) {
              setIsApiKeyMissing(true);
              throw new Error(cognitoResponse.error);
            }
            throw new Error(cognitoResponse.text);
          }
        } else {
          cognitoResponse = await generateResponse(cognitoPrompt, selectedModelApiName);
          if (cognitoResponse.error) {
            if (cognitoResponse.error.includes("API key not valid")) setIsApiKeyMissing(true);
            throw new Error(cognitoResponse.text);
          }
        }

        let cognitoParsedResponse = parseAIResponse(cognitoResponse.text);
        if (cognitoParsedResponse.newNotepadContent !== null) {
          setNotepadContent(cognitoParsedResponse.newNotepadContent);
          setLastNotepadUpdateBy(MessageSender.Cognito);
        }
        addMessage(cognitoParsedResponse.spokenText, MessageSender.Cognito, MessagePurpose.CognitoToMuse, cognitoResponse.durationMs);

        if (discussionMode === DiscussionMode.AiDriven) {
          if (cognitoParsedResponse.discussionShouldEnd) {
            discussionComplete = true;
            addMessage(`双方AI (${MessageSender.Cognito} 和 ${MessageSender.Muse}) 已同意结束讨论。`, MessageSender.System, MessagePurpose.SystemNotification);
          }
        }

        if (discussionMode === DiscussionMode.FixedTurns && currentTurn === maxTurns - 1) {
          discussionComplete = true;
        }

        if (cancelRequestRef.current) { console.log("Cancelled during discussion loop (before Muse reply)."); return; }

        // Muse's turn
        let musePrompt = `${MUSE_SYSTEM_PROMPT_HEADER}
${currentTurn === 0 ? `\n用户问题: ${userInput}` : ''}
${NOTEPAD_INSTRUCTION_PROMPT_PART.replace('{notepadContent}', notepadContent)}
${discussionMode === DiscussionMode.AiDriven ? AI_DRIVEN_DISCUSSION_INSTRUCTION_PROMPT_PART : ''}`;

        let museResponse;
        if (isGrokModel) {
          museResponse = await grokService.generateResponse(
            [...messages, { id: 'system', text: musePrompt, sender: MessageSender.System, purpose: MessagePurpose.SystemNotification, timestamp: new Date() }],
            selectedModelApiName
          );
          if (museResponse.error) {
            if (museResponse.error.includes("API key not valid")) {
              setIsApiKeyMissing(true);
              throw new Error(museResponse.error);
            }
            throw new Error(museResponse.text);
          }
        } else {
          museResponse = await generateResponse(musePrompt, selectedModelApiName);
          if (museResponse.error) {
            if (museResponse.error.includes("API key not valid")) setIsApiKeyMissing(true);
            throw new Error(museResponse.text);
          }
        }

        let museParsedResponse = parseAIResponse(museResponse.text);
        if (museParsedResponse.newNotepadContent !== null) {
          setNotepadContent(museParsedResponse.newNotepadContent);
          setLastNotepadUpdateBy(MessageSender.Muse);
        }
        addMessage(museParsedResponse.spokenText, MessageSender.Muse, MessagePurpose.MuseToCognito, museResponse.durationMs);

        if (discussionMode === DiscussionMode.AiDriven) {
          if (museParsedResponse.discussionShouldEnd) {
            discussionComplete = true;
            addMessage(`双方AI (${MessageSender.Muse} 和 ${MessageSender.Cognito}) 已同意结束讨论。`, MessageSender.System, MessagePurpose.SystemNotification);
          }
        }

        if (discussionMode === DiscussionMode.FixedTurns && currentTurn === maxTurns - 1) {
          discussionComplete = true;
        }

        if (cancelRequestRef.current) { console.log("Cancelled during discussion loop (before Cognito reply)."); return; }

        // Cognito's reply
        let cognitoReplyPrompt = `${COGNITO_SYSTEM_PROMPT_HEADER}
${currentTurn === 0 ? `\n用户问题: ${userInput}` : ''}
${NOTEPAD_INSTRUCTION_PROMPT_PART.replace('{notepadContent}', notepadContent)}
${discussionMode === DiscussionMode.AiDriven ? AI_DRIVEN_DISCUSSION_INSTRUCTION_PROMPT_PART : ''}`;

        let cognitoReplyResponse;
        if (isGrokModel) {
          cognitoReplyResponse = await grokService.generateResponse(
            [...messages, { id: 'system', text: cognitoReplyPrompt, sender: MessageSender.System, purpose: MessagePurpose.SystemNotification, timestamp: new Date() }],
            selectedModelApiName
          );
          if (cognitoReplyResponse.error) {
            if (cognitoReplyResponse.error.includes("API key not valid")) {
              setIsApiKeyMissing(true);
              throw new Error(cognitoReplyResponse.error);
            }
            throw new Error(cognitoReplyResponse.text);
          }
        } else {
          cognitoReplyResponse = await generateResponse(cognitoReplyPrompt, selectedModelApiName);
          if (cognitoReplyResponse.error) {
            if (cognitoReplyResponse.error.includes("API key not valid")) setIsApiKeyMissing(true);
            throw new Error(cognitoReplyResponse.text);
          }
        }

        let cognitoReplyParsedResponse = parseAIResponse(cognitoReplyResponse.text);
        if (cognitoReplyParsedResponse.newNotepadContent !== null) {
          setNotepadContent(cognitoReplyParsedResponse.newNotepadContent);
          setLastNotepadUpdateBy(MessageSender.Cognito);
        }
        addMessage(cognitoReplyParsedResponse.spokenText, MessageSender.Cognito, MessagePurpose.CognitoToMuse, cognitoReplyResponse.durationMs);

        if (discussionMode === DiscussionMode.AiDriven) {
          if (cognitoReplyParsedResponse.discussionShouldEnd) {
            discussionComplete = true;
            addMessage(`双方AI (${MessageSender.Muse} 和 ${MessageSender.Cognito}) 已同意结束讨论。`, MessageSender.System, MessagePurpose.SystemNotification);
          }
        }

        if (discussionMode === DiscussionMode.FixedTurns && currentTurn === maxTurns - 1) {
          discussionComplete = true;
        }

        if (cancelRequestRef.current) { console.log("Cancelled during discussion loop (before final answer)."); return; }

        // Final answer
        let finalPrompt = `${COGNITO_SYSTEM_PROMPT_HEADER}
${currentTurn === 0 ? `\n用户问题: ${userInput}` : ''}
${NOTEPAD_INSTRUCTION_PROMPT_PART.replace('{notepadContent}', notepadContent)}
${discussionMode === DiscussionMode.AiDriven ? AI_DRIVEN_DISCUSSION_INSTRUCTION_PROMPT_PART : ''}`;

        let finalResponse;
        if (isGrokModel) {
          finalResponse = await grokService.generateResponse(
            [...messages, { id: 'system', text: finalPrompt, sender: MessageSender.System, purpose: MessagePurpose.SystemNotification, timestamp: new Date() }],
            selectedModelApiName
          );
          if (finalResponse.error) {
            if (finalResponse.error.includes("API key not valid")) {
              setIsApiKeyMissing(true);
              throw new Error(finalResponse.error);
            }
            throw new Error(finalResponse.text);
          }
        } else {
          finalResponse = await generateResponse(finalPrompt, selectedModelApiName);
          if (finalResponse.error) {
            if (finalResponse.error.includes("API key not valid")) setIsApiKeyMissing(true);
            throw new Error(finalResponse.text);
          }
        }

        let { spokenText: finalSpokenText, newNotepadContent: finalNotepadUpdate } = parseAIResponse(finalResponse.text);
        if (finalNotepadUpdate !== null) {
          setNotepadContent(finalNotepadUpdate);
          setLastNotepadUpdateBy(MessageSender.Cognito);
        }
        addMessage(finalSpokenText, MessageSender.Cognito, MessagePurpose.FinalResponse, finalResponse.durationMs);

        if (discussionMode === DiscussionMode.AiDriven && currentTurn === maxTurns - 1) {
          addMessage(`已达到AI驱动模式下的最大讨论轮次。 ${MessageSender.Cognito} 将准备最终答复。`, MessageSender.System, MessagePurpose.SystemNotification);
        }

        currentTurn++;
      }
    } catch (error) {
      console.error('Error in chat:', error);
      addMessage(
        `错误: ${error instanceof Error ? error.message : '未知错误'}`,
        MessageSender.System,
        MessagePurpose.SystemNotification
      );
    } finally {
      setIsLoading(false);
      currentQueryStartTimeRef.current = null;
    }
  };
  
  const Separator = () => <div className="h-6 w-px bg-gray-600" aria-hidden="true"></div>;

  return (
    <div className="flex flex-col h-screen max-w-7xl mx-auto bg-gray-900 shadow-2xl rounded-lg overflow-hidden">
      <header className="p-4 bg-gray-900 border-b border-gray-700 flex items-center justify-between shrink-0 space-x-2 md:space-x-4 flex-wrap">
        <div className="flex items-center shrink-0">
          <BotMessageSquare size={28} className="mr-2 md:mr-3 text-sky-400" />
          <h1 className="text-xl md:text-2xl font-semibold text-sky-400">Dual AI Chat</h1>
        </div>
        
        <div className="flex items-center space-x-2 md:space-x-3 flex-wrap justify-end gap-y-2">
          <div className="flex items-center">
            <label htmlFor="modelSelector" className="text-sm text-gray-300 mr-1.5 flex items-center shrink-0">
              <Cpu size={18} className="mr-1 text-sky-400"/>
              模型:
            </label>
            <select
              id="modelSelector"
              value={selectedModelApiName}
              onChange={(e) => setSelectedModelApiName(e.target.value)}
              className="bg-gray-700 border border-gray-600 text-white text-sm rounded-md p-1.5 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none"
              aria-label="选择AI模型"
            >
              {MODELS.map((model) => (
                <option key={model.id} value={model.apiName}>
                  {model.name}
                </option>
              ))}
            </select>
          </div>
          
          <Separator />

          <div className="flex items-center space-x-1.5"> {/* Group for discussion mode toggle and fixed turns input */}
            <label
              htmlFor="discussionModeToggle"
              className="flex items-center text-sm text-gray-300 cursor-pointer hover:text-sky-400"
              title={discussionMode === DiscussionMode.FixedTurns ? "切换到AI驱动模式" : "切换到固定轮次模式"}
            >
              {discussionMode === DiscussionMode.FixedTurns 
                ? <MessagesSquare size={18} className="mr-1 text-sky-400" /> 
                : <Bot size={18} className="mr-1 text-sky-400" />}
              <span className="mr-1 select-none shrink-0">模式:</span>
              <div className="relative">
                <input
                  type="checkbox"
                  id="discussionModeToggle"
                  className="sr-only peer"
                  checked={discussionMode === DiscussionMode.AiDriven}
                  onChange={() => setDiscussionMode(prev => prev === DiscussionMode.FixedTurns ? DiscussionMode.AiDriven : DiscussionMode.FixedTurns)}
                  aria-label="切换对话模式"
                />
                <div className={`block w-10 h-6 rounded-full transition-colors ${discussionMode === DiscussionMode.AiDriven ? 'bg-sky-500' : 'bg-gray-600'}`}></div>
                <div className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${discussionMode === DiscussionMode.AiDriven ? 'translate-x-4' : ''}`}></div>
              </div>
              <span className="ml-1.5 select-none shrink-0 min-w-[4rem] text-left">
                {discussionMode === DiscussionMode.FixedTurns ? '固定' : 'AI驱动'}
              </span>
            </label>
            {discussionMode === DiscussionMode.FixedTurns && (
              <div className="flex items-center text-sm text-gray-300">
                <input
                  type="number"
                  id="manualFixedTurnsInput"
                  value={manualFixedTurns}
                  onChange={handleManualFixedTurnsChange}
                  min={MIN_MANUAL_FIXED_TURNS}
                  max={MAX_MANUAL_FIXED_TURNS}
                  className="w-14 bg-gray-700 border border-gray-600 text-white text-sm rounded-md p-1 text-center focus:ring-1 focus:ring-sky-500 focus:border-sky-500 outline-none"
                  aria-label="设置固定轮次数量"
                  disabled={isLoading}
                />
                <span className="ml-1 select-none">轮</span>
              </div>
            )}
          </div>

          <Separator />

          <label
            htmlFor="thinkingToggle"
            className={`flex items-center text-sm text-gray-300 transition-opacity ${!modelSupportsThinkingBudget ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:text-sky-400'}`}
            title={
              modelSupportsThinkingBudget
                ? (isThinkingBudgetEnabled ? "切换为快速模式 (禁用AI思考预算)" : "切换为优质模式 (启用AI思考预算)")
                : "此模型不支持思考预算设置"
            }
          >
            <SlidersHorizontal size={18} className={`mr-1.5 ${modelSupportsThinkingBudget && isThinkingBudgetEnabled ? 'text-sky-400' : 'text-gray-500'}`} />
            <span className="mr-2 select-none shrink-0">预算:</span>
            <div className="relative">
              <input
                type="checkbox"
                id="thinkingToggle"
                className="sr-only peer"
                checked={isThinkingBudgetEnabled}
                onChange={() => {
                  if (modelSupportsThinkingBudget) {
                    setIsThinkingBudgetEnabled(!isThinkingBudgetEnabled);
                  }
                }}
                disabled={!modelSupportsThinkingBudget}
                aria-label="切换AI思考预算"
              />
              <div className={`block w-10 h-6 rounded-full transition-colors ${modelSupportsThinkingBudget ? (isThinkingBudgetEnabled ? 'bg-sky-500 peer-checked:bg-sky-500' : 'bg-gray-600') : 'bg-gray-700'}`}></div>
              <div className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${modelSupportsThinkingBudget && isThinkingBudgetEnabled ? 'peer-checked:translate-x-4' : ''} ${!modelSupportsThinkingBudget ? 'bg-gray-400' : ''}`}></div>
            </div>
            <span className="ml-2 w-20 text-left select-none shrink-0"> {/* Adjusted width for "优质/快速" */}
              {modelSupportsThinkingBudget
                ? (isThinkingBudgetEnabled ? '优质' : '快速')
                : '(不支持)'}
            </span>
          </label>

          <Separator />

          <button
            onClick={handleClearChat}
            className="p-2 text-gray-400 hover:text-sky-400 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 focus:ring-offset-gray-900 rounded-md shrink-0"
            aria-label="清空会话"
            title="清空会话"
          >
            <RefreshCcw size={22} />
          </button>
        </div>
      </header>

      <div className="flex flex-row flex-grow overflow-hidden">
        <div className="flex flex-col w-2/3 md:w-3/5 lg:w-2/3 h-full">
          <div ref={chatContainerRef} className="flex-grow p-4 space-y-4 overflow-y-auto bg-gray-800 scroll-smooth">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
          </div>
          <ChatInput onSendMessage={handleSendMessage} isLoading={isLoading} isApiKeyMissing={isApiKeyMissing} />
        </div>

        <div className="w-1/3 md:w-2/5 lg:w-1/3 h-full bg-slate-800">
          <Notepad
            content={notepadContent}
            lastUpdatedBy={lastNotepadUpdateBy}
            isLoading={isLoading}
          />
        </div>
      </div>

      { (isLoading || (currentTotalProcessingTimeMs > 0 && !isLoading) || (isLoading && currentTotalProcessingTimeMs === 0)) && (
         <div className="fixed bottom-4 right-4 md:bottom-6 md:right-6 bg-gray-900 bg-opacity-80 text-white p-2 rounded-md shadow-lg text-xs z-50">
            总耗时: {(currentTotalProcessingTimeMs / 1000).toFixed(2)}s
        </div>
      )}
       {isApiKeyMissing &&
        !messages.some(msg => msg.text.includes("API_KEY 未配置") || msg.text.includes("API密钥无效")) &&
        !messages.some(msg => msg.text.includes("严重警告：API_KEY 未配置")) &&
        (
        <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 p-3 bg-red-700 text-white rounded-lg shadow-lg flex items-center text-sm z-50">
            <AlertTriangle size={20} className="mr-2" /> API密钥未配置或无效。请检查控制台获取更多信息。
        </div>
      )}
    </div>
  );
};

export default App;