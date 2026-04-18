// ===========================
// RNB Events Chatbot
// ===========================

const chatbotFAQ = {
    "general": [
        {
            q: "What does RNB Events do exactly?",
            a: "We provide full-service event solutions including planning, décor design, rentals, and styling. From concept to execution, we handle everything to bring your vision to life."
        },
        {
            q: "Do you only do weddings?",
            a: "No, we handle weddings, birthdays, engagements, corporate events, and other special occasions."
        },
        {
            q: "Can you help if I've never planned an event before?",
            a: "Absolutely. We guide you step by step—from ideas to execution."
        },
        {
            q: "Do you offer full planning or just decoration?",
            a: "Both. You can choose full planning or décor-only services depending on your needs."
        }
    ],
    "design": [
        {
            q: "Can you decorate my wedding or event?",
            a: "Yes, we specialize in elegant, customized décor for all types of events.",
            category: "design"
        },
        {
            q: "Can you match my theme or colors?",
            a: "Yes, all designs are tailored to your vision, colors, and style.",
            category: "design"
        },
        {
            q: "Can you recreate a design I saw online?",
            a: "We can recreate and elevate inspiration ideas to match your event.",
            category: "design"
        },
        {
            q: "Do you provide centerpieces, backdrops, and floral designs?",
            a: "Yes, we offer a full range of décor elements including centerpieces, backdrops, and floral arrangements.",
            category: "design"
        },
        {
            q: "Can I customize everything?",
            a: "Yes, every event is fully customizable.",
            category: "design"
        }
    ],
    "pricing": [
        {
            q: "How much does it cost?",
            a: "Pricing depends on your event size, design, and services. We provide custom quotes after consultation.",
            triggerQuote: true
        },
        {
            q: "Do you offer packages?",
            a: "Yes, we offer packages (e.g., Silver, Gold, Platinum) that can be customized.",
            triggerQuote: true
        },
        {
            q: "Can you work within my budget?",
            a: "Yes, we tailor designs to align with your budget while maximizing impact.",
            triggerQuote: true
        },
        {
            q: "What's included in your pricing?",
            a: "Costs typically include décor, rentals, labor, setup, breakdown, and transportation (based on scope).",
            triggerQuote: true
        },
        {
            q: "Do you offer payment plans?",
            a: "Yes, flexible payment options are available."
        },
        {
            q: "Is the deposit refundable?",
            a: "Deposits are typically non-refundable but may be transferable depending on the situation."
        }
    ],
    "booking": [
        {
            q: "How do I get started?",
            a: "Submit a quote request through our website. You'll receive access to your client portal."
        },
        {
            q: "How do I secure my date?",
            a: "Your date is confirmed once a deposit is made and the contract is signed."
        },
        {
            q: "How far in advance should I book?",
            a: "We recommend booking as early as possible, especially for weddings."
        },
        {
            q: "Can I book last minute?",
            a: "Yes, depending on availability."
        },
        {
            q: "What happens after I book?",
            a: "We begin planning, design collaboration, and coordination through your client portal."
        }
    ],
    "designProcess": [
        {
            q: "Will I see my design before the event?",
            a: "Yes, we create mood boards and collaborate with you before finalizing."
        },
        {
            q: "Can I change my design later?",
            a: "Yes, changes can be made within a certain timeframe."
        },
        {
            q: "Do you help with ideas if I'm unsure?",
            a: "Yes, we guide you with creative direction and recommendations."
        },
        {
            q: "Can I send inspiration pictures?",
            a: "Absolutely—we use your inspiration to build your design."
        }
    ],
    "logistics": [
        {
            q: "Do you handle setup and breakdown?",
            a: "Yes, our team manages full setup and teardown."
        },
        {
            q: "Do you travel for events?",
            a: "Yes, travel services are available (fees may apply depending on location)."
        },
        {
            q: "Do you work with my venue?",
            a: "Yes, we coordinate directly with venues for smooth execution.",
            category: "venue"
        },
        {
            q: "Do you stay during the event?",
            a: "Optional coordination services are available for on-site support."
        },
        {
            q: "What if something goes wrong?",
            a: "We plan ahead and bring backup solutions to ensure your event runs smoothly."
        }
    ],
    "rentals": [
        {
            q: "What items do you offer for rental?",
            a: "We offer tables, chairs, centerpieces, backdrops, candles, and more."
        },
        {
            q: "Can I rent items without full service?",
            a: "Yes, rental-only options may be available depending on availability."
        },
        {
            q: "Are rentals customizable?",
            a: "Yes, styling options are available for most rental items."
        }
    ],
    "policies": [
        {
            q: "Can I make changes after booking?",
            a: "Yes, changes can be made within agreed timelines."
        },
        {
            q: "What if my guest count changes?",
            a: "We adjust your setup and pricing accordingly."
        },
        {
            q: "Can I reschedule my event?",
            a: "Yes, based on availability."
        },
        {
            q: "What happens if I cancel?",
            a: "Cancellation terms are outlined in your contract."
        }
    ],
    "portal": [
        {
            q: "What is the client portal?",
            a: "It's your personalized space to manage your event—view quotes, designs, contracts, and updates."
        },
        {
            q: "Can I track everything there?",
            a: "Yes, all progress, communication, and documents are centralized."
        },
        {
            q: "Can I upload inspiration or ask questions there?",
            a: "Yes, the portal allows full collaboration."
        },
        {
            q: "Is my information secure?",
            a: "Yes, your data is protected and confidential."
        }
    ],
    "trust": [
        {
            q: "Why choose RNB Events?",
            a: "We combine creativity, organization, and a personalized experience to deliver unforgettable events."
        },
        {
            q: "Do you have past work I can see?",
            a: "Yes, we provide portfolios and examples of previous events."
        },
        {
            q: "Can you handle luxury events?",
            a: "Yes, we specialize in both standard and luxury event designs."
        }
    ],
    "readyToBook": [
        {
            q: "How do I book now?",
            a: "Submit a quote request on our website to get started."
        },
        {
            q: "Can I get a quote today?",
            a: "Yes, we typically respond within 24–48 hours.",
            triggerQuote: true
        },
        {
            q: "What's the next step?",
            a: "Request a quote → Access your portal → Confirm your booking → Start designing your event."
        }
    ]
};

// Flatten all FAQs for easy searching
const allFAQs = Object.values(chatbotFAQ).flat();

// Sample questions for typing animation
const sampleQuestions = [
    "What does RNB Events do?",
    "How much does it cost?",
    "Can you match my theme?",
    "Do you travel for events?",
    "How do I get started?",
    "Can you work within my budget?",
    "Do you only do weddings?",
    "What's included in pricing?"
];

class RNBChatbot {
    constructor() {
        this.chatMessages = [];
        this.currentTypingIndex = 0;
        this.typingInterval = null;
        this.currentSampleQuestion = '';
        this.isTyping = false;
        this.init();
    }

    init() {
        this.createChatbotUI();
        this.attachEventListeners();
        this.startTypingAnimation();
        this.addWelcomeMessage();
    }

    createChatbotUI() {
        // Chatbot UI is already in HTML, just get references
        this.chatContainer = document.getElementById('chatbot-messages');
        this.inputField = document.getElementById('chatbot-input');
        this.sendButton = document.getElementById('chatbot-send');
    }

    attachEventListeners() {
        this.sendButton?.addEventListener('click', () => this.handleUserMessage());
        this.inputField?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.handleUserMessage();
            }
        });

        // Stop typing animation when user focuses on input
        this.inputField?.addEventListener('focus', () => {
            this.stopTypingAnimation();
        });

        // Resume typing animation when user blurs input (if empty)
        this.inputField?.addEventListener('blur', () => {
            if (!this.inputField.value.trim()) {
                setTimeout(() => this.startTypingAnimation(), 1000);
            }
        });
    }

    startTypingAnimation() {
        if (this.isTyping) return;
        this.isTyping = true;
        this.typeNextQuestion();
    }

    stopTypingAnimation() {
        this.isTyping = false;
        if (this.typingInterval) {
            clearInterval(this.typingInterval);
            this.typingInterval = null;
        }
        this.inputField.placeholder = 'Ask me anything...';
    }

    typeNextQuestion() {
        if (!this.isTyping) return;

        const question = sampleQuestions[this.currentTypingIndex % sampleQuestions.length];
        this.currentSampleQuestion = question;
        let charIndex = 0;

        // Typing phase
        const typeInterval = setInterval(() => {
            if (!this.isTyping) {
                clearInterval(typeInterval);
                return;
            }

            if (charIndex <= question.length) {
                this.inputField.placeholder = question.substring(0, charIndex) + '|';
                charIndex++;
            } else {
                clearInterval(typeInterval);
                // Pause before erasing
                setTimeout(() => {
                    if (!this.isTyping) return;
                    this.eraseQuestion(question);
                }, 2000);
            }
        }, 100);
    }

    eraseQuestion(question) {
        if (!this.isTyping) return;

        let charIndex = question.length;
        
        const eraseInterval = setInterval(() => {
            if (!this.isTyping) {
                clearInterval(eraseInterval);
                return;
            }

            if (charIndex >= 0) {
                this.inputField.placeholder = question.substring(0, charIndex) + '|';
                charIndex--;
            } else {
                clearInterval(eraseInterval);
                // Move to next question
                this.currentTypingIndex++;
                setTimeout(() => {
                    if (!this.isTyping) return;
                    this.typeNextQuestion();
                }, 500);
            }
        }, 50);
    }

    addWelcomeMessage() {
        const welcomeMsg = {
            type: 'bot',
            text: "👋 Hi! I'm here to help you learn about RNB Events. Ask me anything about our services, pricing, or event planning process!"
        };
        this.addMessage(welcomeMsg);
    }

    handleUserMessage() {
        const userInput = this.inputField.value.trim();
        if (!userInput) return;

        // Add user message
        this.addMessage({ type: 'user', text: userInput });
        this.inputField.value = '';

        // Find and add bot response
        setTimeout(() => {
            const response = this.findBestResponse(userInput);
            this.addMessage({ type: 'bot', text: response.answer, triggerQuote: response.triggerQuote });
        }, 600);
    }

    findBestResponse(userInput) {
        const input = userInput.toLowerCase();

        // Check for pricing/venue/decor keywords that should trigger quote
        const quoteKeywords = ['price', 'pricing', 'cost', 'how much', 'budget', 'quote', 'estimate', 'venue', 'specific venue', 'decor', 'decoration'];
        const shouldTriggerQuote = quoteKeywords.some(keyword => input.includes(keyword));

        // Search for best matching FAQ
        let bestMatch = null;
        let highestScore = 0;

        allFAQs.forEach(faq => {
            const questionLower = faq.q.toLowerCase();
            const words = input.split(' ');
            let score = 0;

            // Calculate match score
            words.forEach(word => {
                if (word.length > 3 && questionLower.includes(word)) {
                    score += 2;
                }
            });

            // Exact phrase bonus
            if (questionLower.includes(input) || input.includes(questionLower.substring(0, 20))) {
                score += 10;
            }

            if (score > highestScore) {
                highestScore = score;
                bestMatch = faq;
            }
        });

        // If we found a good match
        if (bestMatch && highestScore > 0) {
            return {
                answer: bestMatch.a,
                triggerQuote: shouldTriggerQuote || bestMatch.triggerQuote
            };
        }

        // Default response
        return {
            answer: "I'd love to help with that! For specific questions about your event, I recommend requesting a quote so our team can provide personalized assistance. You can also explore our services page or check out our portfolio for inspiration.",
            triggerQuote: shouldTriggerQuote
        };
    }

    addMessage(message) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `chatbot-message chatbot-message-${message.type}`;
        
        const bubble = document.createElement('div');
        bubble.className = 'chatbot-message-bubble';
        bubble.textContent = message.text;
        
        messageDiv.appendChild(bubble);
        this.chatContainer.appendChild(messageDiv);

        // Scroll to bottom
        this.chatContainer.scrollTop = this.chatContainer.scrollHeight;

        // If this should trigger quote, show button
        if (message.triggerQuote && message.type === 'bot') {
            setTimeout(() => {
                const quotePrompt = document.createElement('div');
                quotePrompt.className = 'chatbot-message chatbot-message-bot';
                
                // Check if openQuoteModal exists (for service.html)
                const quoteAction = typeof openQuoteModal === 'function' 
                    ? `openQuoteModal(); if(typeof remusClick === 'function') remusClick('chatbot_quote');`
                    : `window.location.href='/service';`;
                
                quotePrompt.innerHTML = `
                    <div class="chatbot-message-bubble chatbot-quote-prompt">
                        Would you like to request a personalized quote?
                        <button class="chatbot-quote-btn" onclick="${quoteAction}">Request a Quote</button>
                    </div>
                `;
                this.chatContainer.appendChild(quotePrompt);
                this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
            }, 800);
        }
    }
}

// Initialize chatbot when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('rnb-chatbot')) {
        new RNBChatbot();
    }
});
