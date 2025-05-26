
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Send, Paperclip, XCircle } from 'lucide-react';
import LoadingSpinner from './LoadingSpinner';

interface ChatInputProps {
  onSendMessage: (message: string, imageFile?: File | null) => void;
  isLoading: boolean;
  isApiKeyMissing: boolean;
}

const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

const ChatInput: React.FC<ChatInputProps> = ({ onSendMessage, isLoading, isApiKeyMissing }) => {
  const [inputValue, setInputValue] = useState('');
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (selectedImage) {
      const objectUrl = URL.createObjectURL(selectedImage);
      setImagePreviewUrl(objectUrl);
      return () => URL.revokeObjectURL(objectUrl);
    }
    setImagePreviewUrl(null);
  }, [selectedImage]);

  const handleImageFile = (file: File | null) => {
    if (file && ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setSelectedImage(file);
    } else if (file) {
      alert('不支持的文件类型。请选择 JPG, PNG, GIF, 或 WEBP 格式的图片。');
      setSelectedImage(null);
    } else {
      setSelectedImage(null);
    }
    // Reset file input value to allow selecting the same file again
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeImage = () => {
    setSelectedImage(null);
    setImagePreviewUrl(null);
  };

  const triggerSendMessage = () => {
    if ((inputValue.trim() || selectedImage) && !isLoading && !isApiKeyMissing) {
      onSendMessage(inputValue.trim(), selectedImage);
      setInputValue('');
      removeImage(); // Clear image after sending
      if (textareaRef.current) { // Reset textarea height after sending
        textareaRef.current.style.height = 'auto'; 
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    triggerSendMessage();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault(); // Prevent new line
      triggerSendMessage();
    }
  };

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (items) {
      for (let i = 0; i < items.length; i++) {
        if (ACCEPTED_IMAGE_TYPES.includes(items[i].type)) {
          const file = items[i].getAsFile();
          if (file) {
            handleImageFile(file);
            e.preventDefault(); // Prevent pasting file path as text
            break;
          }
        }
      }
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleImageFile(e.dataTransfer.files[0]);
      e.dataTransfer.clearData();
    }
  }, []);

  const handleDragOver = (e: React.DragEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    setIsDraggingOver(false);
  };
  
  const handleFileButtonClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleImageFile(e.target.files[0]);
    }
  };

  const isDisabled = isLoading || isApiKeyMissing;

  return (
    <form onSubmit={handleSubmit} className="p-4 bg-gray-800 border-t border-gray-700">
      {imagePreviewUrl && selectedImage && (
        <div className="mb-2 p-2 bg-gray-700 rounded-md relative max-w-xs">
          <img src={imagePreviewUrl} alt={selectedImage.name || "图片预览"} className="max-h-24 max-w-full rounded" />
          <button
            type="button"
            onClick={removeImage}
            className="absolute top-1 right-1 bg-black bg-opacity-50 text-white rounded-full p-0.5 hover:bg-opacity-75"
            aria-label="移除图片"
          >
            <XCircle size={20} />
          </button>
          <div className="text-xs text-gray-300 mt-1 truncate">{selectedImage.name} ({(selectedImage.size / 1024).toFixed(1)} KB)</div>
        </div>
      )}
      <div className="flex items-end space-x-2">
        <textarea
          ref={textareaRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown} // Added keydown handler
          onPaste={handlePaste}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          placeholder={isApiKeyMissing ? "API密钥未配置，聊天功能已禁用。" : (isDraggingOver ? "将图片拖放到此处" : "输入您的消息 (Ctrl+Enter 发送) 或粘贴/拖放图片...")}
          className={`flex-grow p-3 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none placeholder-gray-400 disabled:opacity-50 resize-none min-h-[48px] max-h-[150px] ${isDraggingOver ? 'ring-2 ring-sky-500 border-sky-500' : ''}`}
          rows={1} // Start with 1 row, auto-expands
          disabled={isDisabled}
          aria-label="聊天输入框"
          onInput={(e) => { // Auto-resize textarea
            const target = e.target as HTMLTextAreaElement;
            target.style.height = 'auto';
            target.style.height = `${target.scrollHeight}px`;
          }}
        />
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelected}
          accept={ACCEPTED_IMAGE_TYPES.join(',')}
          className="hidden"
          aria-label="选择图片文件"
        />
        <button
          type="button"
          onClick={handleFileButtonClick}
          className="p-3 bg-gray-600 hover:bg-gray-500 rounded-lg text-white transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed self-end h-[48px]"
          disabled={isDisabled}
          aria-label="添加图片附件"
          title="添加图片"
        >
          <Paperclip size={24} />
        </button>
        <button
          type="submit"
          className="p-3 bg-sky-600 hover:bg-sky-700 rounded-lg text-white transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed self-end h-[48px]"
          disabled={isDisabled || (!inputValue.trim() && !selectedImage)}
          aria-label={isLoading ? "发送中" : "发送消息"}
        >
          {isLoading ? <LoadingSpinner size="w-6 h-6" color="text-white" /> : <Send size={24} />}
        </button>
      </div>
    </form>
  );
};

export default ChatInput;
