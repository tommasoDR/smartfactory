from langchain.prompts import PromptTemplate
from chains.graph_qa import GraphSparqlQAChain
from schemas.promptmanager import PromptManager

# Initialize the prompt manager
prompt_manager = PromptManager('prompts/')

def get_machines_namess(graph):
    """
    Retrieves the names of the machines from the RDF graph.
    
    Args:
        graph: The RDF graph containing the machine data.
    
    Returns:
        A list of machine names.
    """
    # Query to retrieve the names of the machines
    query = """
    PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
    PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
    PREFIX owl: <http://www.w3.org/2002/07/owl#>
    PREFIX sa-ontology: <http://www.semanticweb.org/raffi/ontologies/2024/10/sa-ontology#>
    
    SELECT DISTINCT ?machine_name
    WHERE {
        ?machine sa-ontology:id ?machine_name .
        ?machine sa-ontology:producesKPI ?kpi .
    }
    """
    
    # Execute the query and retrieve the results
    results = graph.query(query)
    
    # Extract the machine names from the results
    machine_names = [result['machine_name'] for result in results]
    
    return machine_names

def get_kpi_names(graph):
    """
    Retrieves the names of the KPIs from the RDF graph.
    
    Args:
        graph: The RDF graph containing the KPI data.
    
    Returns:
        A list of KPI names.
    """
    # Query to retrieve the names of the KPIs
    query = """
    PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
    PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
    PREFIX owl: <http://www.w3.org/2002/07/owl#>
    PREFIX sa-ontology: <http://www.semanticweb.org/raffi/ontologies/2024/10/sa-ontology#>
    
    SELECT DISTINCT ?kpi_name
    WHERE {
        ?kpi sa-ontology:id ?kpi_name .
        ?kpi sa-ontology:atomic ?atomic .
    }
    """
    
    # Execute the query and retrieve the results
    results = graph.query(query)
    
    # Extract the KPI names from the results
    kpi_names = [result['kpi_name'] for result in results]
    
    return kpi_names
  

# GENERAL QA CHAIN
class GeneralQAChain:
  def __init__(self, llm, graph, history):
    """
    Initializes the GeneralQAChain to handle QA tasks related to graph-based queries.

    Args:
        llm: The language model to generate responses.
        graph: The RDF graph containing the data.
        history: A list of previous conversation entries to inform the context.
    """
    self._llm = llm
    self._graph = graph

    # Format the conversation history into a context string
    history_context = "CONVERSATION HISTORY:\n" + "\n\n".join(
        [f"Q: {entry['question']}\nA: {entry['answer']}" for entry in history]
    )

    # Retrieve the machines and KPI id from the graph
    machines = get_machines_namess(graph)
    kpis = get_kpi_names(graph)
    
    general_QA_prompt_select = prompt_manager.get_partial_init_prompt('qa_select', history_context=history_context)

    general_QA_prompt_answer = prompt_manager.get_prompt('qa_answer')

    # Initialize the chain that connects the prompts with the graph-based QA
    self.chain = GraphSparqlQAChain.from_llm(
      self._llm, graph=self._graph, verbose=True, allow_dangerous_requests=True, sparql_select_prompt=general_QA_prompt_select, qa_prompt=general_QA_prompt_answer
    )

# KPI GENERATION CHAIN
class KPIGenerationChain:
  def __init__(self, llm, graph, history):
    """
    Initializes the KPIGenerationChain to generate and query KPIs based on user input.

    Args:
        llm: The language model to generate responses.
        graph: The RDF graph containing the KPI data.
        history: A list of previous conversation entries to inform the context.
    """
    self._llm = llm
    self._graph = graph

    # Format the conversation history into a context string
    history_context = "CONVERSATION HISTORY:\n" + "\n\n".join(
        [f"Q: {entry['question']}\nA: {entry['answer']}" for entry in history]
    )

    kpi_generation_prompt_select = prompt_manager.get_partial_init_prompt('kpi_generation_select', history_context=history_context)
    
    qa_kpi_generation_prompt = prompt_manager.get_prompt('kpi_generation_answer')
    
    # Initialize the chain that connects the prompts with KPI generation
    self.chain = GraphSparqlQAChain.from_llm(
        self._llm, graph=self._graph, verbose=True, allow_dangerous_requests=True, sparql_select_prompt=kpi_generation_prompt_select, qa_prompt=qa_kpi_generation_prompt
    )

# DASHBOARD GENERATION CHAIN
class DashboardGenerationChain:
  def __init__(self, llm, graph, history):
    """
    Initializes the DashboardGenerationChain to generate and query dashboards based on user input.

    Args:
        llm: The language model to generate responses.
        graph: The RDF graph containing the KPI and dashboard data.
        history: A list of previous conversation entries to inform the context.
    """
    self._llm = llm
    self._graph = graph

    # Format the conversation history into a context string
    history_context = "CONVERSATION HISTORY:\n" + "\n\n".join(
        [f"Q: {entry['question']}\nA: {entry['answer']}" for entry in history]
    )

    dashboard_generation_prompt_select = prompt_manager.get_partial_init_prompt('dashboard_generation_select', history_context=history_context)

    qa_dashboard_generation_prompt = prompt_manager.get_prompt('dashboard_generation_answer')
    
    # Initialize the chain that connects the prompts with dashboard generation
    self.chain = GraphSparqlQAChain.from_llm(
        self._llm, graph=self._graph, verbose=True, allow_dangerous_requests=True, sparql_select_prompt=dashboard_generation_prompt_select, qa_prompt=qa_dashboard_generation_prompt
    )