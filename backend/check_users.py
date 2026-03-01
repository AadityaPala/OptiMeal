from database import get_supabase_client

supabase = get_supabase_client()
response = supabase.table("users").select("*").execute()
print(f"Total users: {len(response.data)}")
for user in response.data:
    print(user)
