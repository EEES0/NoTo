from pydantic import BaseModel


class AdminStatusRequest(BaseModel):
    is_admin: bool
