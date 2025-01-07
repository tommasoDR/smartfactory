from typing import Optional
from pydantic import BaseModel

class Question(BaseModel):
  userInput: str
  userId: str
  requestType: str
  
class Answer(BaseModel):
  textResponse: str = ''
  textExplanation: str = ''
  data: Optional[str] = ''
  label: Optional[str] = ''

class AgentRequest(BaseModel):
  userInput: str
  requestType: str