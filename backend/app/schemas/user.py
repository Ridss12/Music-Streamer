from pydantic import BaseModel, EmailStr

class UserCreate(BaseModel):
    name: str
    username: str
    email: EmailStr
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    user_id: int
    name: str
    username: str
    email: EmailStr

    class Config:
        from_attributes = True