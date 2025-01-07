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

    // Effect to handle external requests
    useEffect(() => {
        if(externalRequest.length > 0 && externalRequest !== 'STOP') {
            // Set the external request flag and handle the message
            isExternalRequest = true;
            handleSendMessage();
        }
    }, [externalRequest]);

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
        <div className="fixed bottom-1.5 right-2 z-50">
            {!isChatOpen && (
                <button
                    className="border border-gray-400 text-black w-fit h-fit pt-3 pb-3 p-4 bg-white-600 rounded-full shadow-md flex items-center justify-center hover:scale-110 transition-transform"
                    onClick={toggleChat}
                >
                    <img src={require('./icons/chat-icon.svg').default} alt="Chat Icon" className="w-8 h-8"/>
                    Chat
                </button>
            )}

            {isChatOpen && (
                <div
                    className=" w-96 h-[600] min-h-[20vh] max-h-[90vh] bg-white rounded-lg shadow-xl border border-gray-200 flex flex-col">
                    {/* Header Bar */}
                    <div
                        className="bg-blue-500 text-white px-4 py-3 flex justify-between rounded-t-lg transition duration-300">
                        <div className="flex items-center px-2 gap-2">
                            <img
                                src={'/icons/bot.svg'}
                                alt="Chat Icon"
                                className="w-8 h-8"
                            />
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
                    <div className="bg-yellow-100 text-yellow-800 text-xs px-4 py-2">
                        Disclaimer: This is an AI-powered assistant. Responses may not always be accurate. Verify
                        important information.
                    </div>
                    <div ref={containerRef}
                         className="flex-grow p-4 overflow-y-auto bg-gray-50 space-y-2">
                        {messages.map((message) => (
                            <div
                                key={message.id}
                                className={`flex justify-${message.sender === 'user' ? 'end' : 'start'}`}  // Ensures messages align right for user and left for assistant
                            ><MessageBubble
                                key={message.id}
                                message={message}
                                onNavigate={handleNavigation}
                            />
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
                    <div className="p-2 border-t bg-gray-50 flex items-center">
                        <ChatInput
                            newMessage={newMessage}
                            setNewMessage={setNewMessage}
                            handleSendMessage={handleSendMessage}
                            isTyping={isTyping}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

export default ChatAssistant;
