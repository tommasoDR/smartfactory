import React, {useEffect, useRef, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {interactWithAgent} from '../../api/ApiService';
import ChatInput from './ChatInput';
import MessageBubble, {XAISources} from "./ChatComponents";
import DataManager from "../../api/DataManager";

export interface Message {
    id: number;
    sender: 'user' | 'assistant';
    content: string;
    extraData?: {
        explanation?: XAISources[];
        dashboardData?: { target: string; metadata: any };
        report?: string;
    };
}

export interface ChatAssistantProps {
    username: string;
    userId: string;
    resetRequest: (request: string) => void;
    externalRequest: string;
}

const handleText = (text: string) => {
    // Replace newline characters with <br> tags
    text = text.replace(/\n/g, '<br>');
    // replace **test** with <strong>test</strong> tags
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    return text;
};

const ChatAssistant: React.FC<ChatAssistantProps> = ({username, userId, resetRequest, externalRequest}) => {
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([{
        id: 0,
        sender: 'assistant',
        content: `Hello ${username}! How can I help you today?`
    }]);
    const [newMessage, setNewMessage] = useState('');
    const navigate = useNavigate();
    const [isTyping, setIsTyping] = useState(false);
    const containerRef = useRef<HTMLDivElement | null>(null);
    var isExternalRequest: boolean = false;

    const toggleChat = () => setIsChatOpen((prev) => !prev);

    const handleNavigation = (target: string, metadata: any) => {
        navigate(target, {state: {metadata}});
    };

    // Effect to scroll to the bottom and open the chat when messages change 
    useEffect(() => {
        // Scroll to the bottom of the chat container
        if (containerRef.current) {
            containerRef.current.scrollTop = containerRef.current.scrollHeight;
        }
        // Open chat when a new message is received
        if (!isChatOpen && messages.length > 1) {
            setIsChatOpen(true);
        }
    }, [messages]); // Runs every time `messages` changes

    useEffect(() => {
        if (isChatOpen && containerRef.current) {
            containerRef.current.scrollTop = containerRef.current.scrollHeight;
        }
    }, [isChatOpen]); // Runs every time `isChatOpen` changes

    // Effect to handle external requests
    useEffect(() => {
        if(externalRequest.length > 0 && externalRequest !== 'STOP') {
            // Set the external request flag and handle the message
            isExternalRequest = true;
            handleSendMessage();
        }
    }, [externalRequest]); // Runs every time `externalRequest` changes

    // Start Dragging and resizing functionalities

    const chatRef = useRef<HTMLDivElement | null>(null);
    const headerRef = useRef<HTMLDivElement | null>(null);
    const resizeHandleRef = useRef<HTMLDivElement | null>(null);

    var isDragging:boolean = false;
    const [initialized, setInitialized] = useState<boolean>(false);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    
    var isResizing:boolean = false;
    const [size, setSize] = useState({ width: 500, height: 600 });

    // Initialize the chat position and size w.r.t. the viewport the first time it is opened
    useEffect(() => {
        if (!initialized && isChatOpen && chatRef.current) {
            setInitialized(true);

            // Calculate initial position dynamically
            const chatWidth = chatRef.current.offsetWidth || 400; // Default width if not yet rendered
            const chatHeight = chatRef.current.offsetHeight || 600; // Default height if not yet rendered

            const initialX = window.innerWidth - chatWidth - 20;
            const initialY = window.innerHeight - chatHeight - 0;

            setPosition({ x: initialX, y: initialY });

            // Initialize the chat size
            chatRef.current.style.width = `${size.width}px`;
            chatRef.current.style.height = `${size.height}px`;
        }
    }, [isChatOpen]);

    // Update chat position when dragging
    useEffect(() => {
        if (isChatOpen && chatRef.current) {
            chatRef.current.style.left = `${position.x}px`;
            chatRef.current.style.top = `${position.y}px`;
            chatRef.current.style.width = `${size.width}px`;
            chatRef.current.style.height = `${size.height}px`;
        }
    }, [position, isChatOpen]);
    
    // Dragging functionality
    const handleDragStart = (e: React.MouseEvent<HTMLDivElement>) => {
        isDragging = true;
        e.preventDefault();
        if (!chatRef.current) return;

        const offsetX = e.clientX - chatRef.current.getBoundingClientRect().left;
        const offsetY = e.clientY - chatRef.current.getBoundingClientRect().top;
    
        const handleMouseMove = (moveEvent: MouseEvent) => {
            if (isDragging && chatRef.current) {
              let newX = moveEvent.clientX - offsetX;
              let newY = moveEvent.clientY - offsetY;
      
              // Get the dimensions of the chat and the viewport
              const chatWidth = chatRef.current.offsetWidth;
              const chatHeight = chatRef.current.offsetHeight;
              const viewportWidth = window.innerWidth;
              const viewportHeight = window.innerHeight;
      
              // Constrain the chat within the viewport bounds
              newX = Math.max(0, Math.min(newX, viewportWidth - chatWidth));
              newY = Math.max(0, Math.min(newY, viewportHeight - chatHeight));
      
              setPosition({ x: newX, y: newY });
            }
        }
    
        const handleMouseUp = () => {
            isDragging = false;
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    // Resizing functionality
    const handleResizeStart = (e: React.MouseEvent<HTMLDivElement>) => {
        isResizing = true;
        e.preventDefault();

        const initialWidth = size.width;
        const initialHeight = size.height;
        const initialX = e.clientX;
        const initialY = e.clientY;

        const handleMouseMove = (moveEvent: MouseEvent) => {
        if (isResizing) {
            const newWidth = Math.max(200, initialWidth + (moveEvent.clientX - initialX));
            const newHeight = Math.max(200, initialHeight + (moveEvent.clientY - initialY));

            setSize({ width: newWidth, height: newHeight });
        }
        };

        const handleMouseUp = () => {
            isResizing = false;
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    // End of dragging and resizing functionalities

    
    const handleSendMessage = () => {

        if (!isExternalRequest && !newMessage.trim()) return;

        // Initialize a new user message and request type
        const userMessage: Message = {
            id: messages.length + 1,
            sender: 'user',
            content: '',
        };
        let requestType = '';

        // Handle external requests
        if (isExternalRequest) {
            let request = JSON.parse(externalRequest);
            if(request.type === 'explainChart') {
                // Placeholder message for chart explanation in chat
                let gui_message: Message = {
                    id: messages.length + 1,
                    sender: 'user',
                    content: `Explain ${request.kpi_name} chart.`,
                }
                setMessages((prev) => [...prev, gui_message]);
                // Put the external request in the user message
                userMessage.content = externalRequest;
                // Define requestType
                requestType = 'explainChart';
            }
        }
        // Handle normal messages from the user
        else {
            // Disable external request
            resetRequest('STOP');
            // Use the new message set by the input field
            userMessage.content = newMessage;
            setMessages((prev) => [...prev, userMessage]);
            // Define requestType
            requestType = 'chat';
        }

        //if the message is a command, handle it
        setIsTyping(true);
        interactWithAgent(userId, userMessage.content, requestType)
            .then((response) => {
                let extraData = {};
                console.log(response);
                let explanation: XAISources[];

                try {
                    //try decoding the explanation string
                    const decodedExplanation: Record<string, any>[] = JSON.parse(response.textExplanation);
                    explanation = decodedExplanation.map(XAISources.decode);
                } catch (e) {
                    console.error("Error decoding explanation: ", e);
                    explanation = [];
                }

                if (response.label) {
                    switch (response.label) {
                        case 'dashboard':
                            extraData = {
                                explanation: explanation,
                                dashboardData: {
                                    target: '/dashboard/new',
                                    metadata: response.data,
                                },
                            };
                            break;
                        case 'report':
                            extraData = {
                                explanation: explanation,
                                report: response.data,
                            };
                            response.textResponse = 'The report ' + response.textResponse + ' is ready for review.';
                            break;
                        case 'new_kpi':
                            DataManager.getInstance().refreshKPI();
                            extraData = {
                                explanation: explanation,
                            };
                            break;
                        case 'explainChart':
                            response.textResponse = handleText(response.textResponse);
                            break;
                        default:
                            extraData = {
                                explanation: explanation,
                            };
                    }
                }

                const assistantMessage: Message = {
                    id: messages.length + 2,
                    sender: 'assistant',
                    content: response.textResponse,
                    extraData: extraData,
                };
                setMessages((prev) => [...prev, assistantMessage]);

            })
            .catch(() => {
                setMessages((prev) => [
                    ...prev,
                    {
                        id: messages.length + 2,
                        sender: 'assistant',
                        content: `Sorry, I couldn't process that.`,
                    },
                ]);
            }).finally(() => {
                isExternalRequest = false;  // Clear the external request flag
                resetRequest('');  // Reset the external request string
                setIsTyping(false); // Unlock input
        });
        setTimeout(() => {
            if (isTyping) {
                setMessages((prev) => [
                    ...prev,
                    {
                        id: messages.length + 3,
                        sender: 'assistant',
                        content: `I'm still processing your request...`,
                    },
                ]);
            }
        }, 60);

    }
    return (
        <>
            {/* Fixed Button */}
            <div className="fixed bottom-1.5 right-2 z-50">
                {!isChatOpen && (
                <button
                    className="border border-gray-400 text-black w-fit h-fit pt-3 pb-3 p-4 bg-white rounded-full shadow-md flex items-center justify-center hover:scale-110 transition-transform"
                    onClick={toggleChat}
                >
                    <img src={require('./icons/chat-icon.svg').default} alt="Chat Icon" className="w-8 h-8" />
                    Chat
                </button>
                )}
            </div>        

            {isChatOpen && (
                <div
                    ref={chatRef}
                    className="bg-white rounded-lg shadow-xl border border-gray-200 flex flex-col"
                    style={{
                        position: 'fixed',
                        top: position.y,
                        left: position.x,
                        width: `${size.width}px`,
                        height: `${size.height}px`,
                    }}
                >
                
                {/* Resize handle (bottom-right corner) */}
                <div
                    ref={resizeHandleRef}
                    onMouseDown={handleResizeStart}
                    style={{
                    position: 'absolute',
                    right: 0,
                    bottom: 0,
                    width: '16px',
                    height: '16px',
                    backgroundColor: 'gray',
                    cursor: 'se-resize',
                    }}
                />

                {/* Header Bar */}
                <div
                    ref={headerRef}
                    onMouseDown={handleDragStart}
                    className="bg-blue-500 text-white px-6 py-2 flex justify-between rounded-t-lg cursor-move transition duration-300"
                >
                    <div className="flex items-center px-2 gap-2">
                    <img src={'/icons/bot.svg'} alt="Chat Icon" className="w-8 h-8" />
                    <h3 className="text-base font-medium tracking-wide">AI Assistant</h3>
                    </div>
                    <button
                    onClick={toggleChat}
                    className="text-white text-2xl font-bold hover:scale-110 hover:rotate-90 transition duration-300 ease-in-out"
                    aria-label="Close chat"
                    >
                    ×
                    </button>
                </div>
                <div className="bg-yellow-100 text-yellow-800 text-xs px-4 py-1">
                    Disclaimer: This is an AI-powered assistant. Responses may not always be accurate. Verify important information.
                </div>
                <div ref={containerRef} className="flex-grow p-6 overflow-y-auto bg-gray-50 space-y-4">
                    {messages.map((message) => (
                    <div key={message.id} className={`flex justify-${message.sender === 'user' ? 'end' : 'start'}`}>
                        <MessageBubble key={message.id} message={message} onNavigate={handleNavigation} />
                    </div>
                    ))}
                    {/* Typing indicator bubble */}
                    {isTyping && (
                    <div className="flex justify-start">
                        <div className="bg-gray-200 px-3 py-2 rounded-lg text-sm">
                        <div className="jumping-dots flex space-x-1">
                            <span></span>
                            <span></span>
                            <span></span>
                        </div>
                        </div>
                    </div>
                    )}
                </div>
                {/* Input Section */}
                <div className="p-3 border-t rounded-lg bg-gray-50 flex items-center">
                    <ChatInput
                    newMessage={newMessage}
                    setNewMessage={setNewMessage}
                    handleSendMessage={handleSendMessage}
                    isTyping={isTyping}
                    />
                </div>
                </div>
            )}
            </>
    );
};

export default ChatAssistant;
