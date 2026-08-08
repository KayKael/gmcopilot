create or replace function public.match_documents(
  query_embedding vector(1536),
  match_threshold float,
  match_count int
)
returns table (id uuid, content text, doc_name text, similarity float)
language sql
stable
security invoker
set search_path = public
as $$
  select dc.id, dc.content, dc.doc_name, 1 - (dc.embedding <=> query_embedding) as similarity
  from public.doc_chunks dc
  where dc.embedding is not null
    and 1 - (dc.embedding <=> query_embedding) > match_threshold
  order by dc.embedding <=> query_embedding
  limit match_count;
$$;