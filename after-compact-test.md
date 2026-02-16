 After context compacts, test with these queries:                                                                                          
  # 1. Architecture                                                   
  curl -s -X POST http://192.168.50.19:8200/search/query \                -H "Content-Type: application/json" \                             
    -d '{"query": "What is Recall and how is it built?", "limit": 3}' 
                                                                      
  # 2. Fixes & troubleshooting                                        
  curl -s -X POST http://192.168.50.19:8200/search/query \            
    -H "Content-Type: application/json" \                             
    -d '{"query": "What problems did we fix in Recall?", "limit": 3}' 
                                                                      
  # 3. Full context assembly
  curl -s -X POST http://192.168.50.19:8200/search/context \
    -H "Content-Type: application/json" \
    -d '{"query": "Recall project overview"}'

  Expected results:
  - Architecture query → BGE-large, Qdrant, Neo4j, Redis details (>70%
   similarity)
  - Fixes query → UUID, null filters, query_points, model name,       
  timeout fixes (>70% similarity)
  - Context assembly → Grouped markdown with Known Facts, Experiences,
   Workflows

  When compaction happens, just ask me to "test Recall memory
  retrieval" and I'll run these queries to verify everything
  persisted.